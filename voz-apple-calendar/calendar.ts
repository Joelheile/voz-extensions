import { CalendarError, findEvent, words, type CalendarEvent } from "./events";
import { freeSlot, roundUp, type WorkDay } from "./slots";
import {
  addDays,
  at,
  beforeCorrection,
  clockOf,
  midnight,
  parseWhen,
  type When,
} from "./times";

export { CalendarError, type CalendarEvent } from "./events";

type CalendarInfo = { id: string; title: string; account: string };
export type Snapshot = {
  calendars: CalendarInfo[];
  defaultCalendar: string | null;
  events: CalendarEvent[];
};
export type Request = {
  action: "add" | "change";
  title: string;
  event: string;
  location: string;
};
type Details = {
  title: string;
  location: string;
  start: number;
  end: number;
};
export type Plan =
  | ({ action: "add"; calendar: string } & Details)
  | ({
      action: "update";
      id: string;
      occurrence: number;
      before: Details;
    } & Details);
type Settings = WorkDay & { minutes: number; calendar: string };

const minute = 60_000;
const lateGrace = 15 * minute;
const changeLead =
  /^\W*(?:(?:change|move|update) calendar|(?:add to )?calendar\W+(?:please\W+)?(?:move|push|pull|reschedule|extend|shorten|rename|change|update|delay|postpone|verschieb\w*|änder\w*))\b/i;
const changeVerbs =
  /\b(?:move|push|pull|bring|reschedule|extend|shorten|rename|change|update|delay|postpone|make|should|end|ends|finish|verschieb\w*|verleg\w*|verlänger\w*|kürz\w*|änder\w*|umbenenn\w*)\b/i;
const ownerDay =
  /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)'s\b/i;
const renameWords =
  /\b(?:rename|call it|name it|retitle|umbenenn\w*|nenn\w*)\b/i;
const extendWords = /\b(?:extend|longer|lengthen|verlänger\w*)\b/i;
const shortenWords = /\b(?:shorten|shorter|cut|kürz\w*)\b/i;
const earlierWords =
  /\b(?:earlier|pull|forward|früher|vorzieh\w*|vorverleg\w*)\b/i;
const shiftWords =
  /\b(?:by|later|earlier|push|pull|delay|postpone|back|forward|später|früher|um)\b/i;

export const instructions = `You read a dictated calendar request and fill in fields.
- action: "add" for a new event or time block. "change" to move, resize, rename or relocate an event that already exists, such as "move", "push", "change", "extend" or "rename".
- title: for add, a short title in the dictation's language, without times or dates, such as "Deep work" or "Lunch with Tom". For change, the new name only if they rename it, else "".
- event: for change, the words that name the existing event, copied from the dictation, without the new time. For add, "".
- location: a place or room they name, copied from the dictation, else "".

Example: "calendar deep work tomorrow at 9 for 2 hours"
{"action":"add","title":"Deep work","event":"","location":""}

Example: "calendar lunch with Tom on Friday at noon at Café Nero"
{"action":"add","title":"Lunch with Tom","event":"","location":"Café Nero"}

Example: "calendar find an hour tomorrow afternoon to write the board report"
{"action":"add","title":"Write the board report","event":"","location":""}

Example: "change calendar move my 3pm to 4"
{"action":"change","title":"","event":"my 3pm","location":""}

Example: "calendar push standup by 15 minutes"
{"action":"change","title":"","event":"standup","location":""}

Example: "calendar make my next meeting 30 minutes"
{"action":"change","title":"","event":"my next meeting","location":""}

Example: "calendar rename the design review on Thursday to roadmap review"
{"action":"change","title":"Roadmap review","event":"the design review on Thursday","location":""}

Example: "calendar move lunch with Tom to Café Luna"
{"action":"change","title":"","event":"lunch with Tom","location":"Café Luna"}`;

export const schema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add", "change"] },
    title: { type: "string", description: "Short title, or the new name" },
    event: { type: "string", description: "Words naming the existing event" },
    location: { type: "string", description: "Place, or empty" },
  },
  required: ["action", "title", "event", "location"],
} as const;

export function plan(
  request: Request,
  snapshot: Snapshot,
  now: Date,
  settings: Settings,
  dictation: string,
): Plan {
  const location = says(dictation, request.location)
    ? request.location.trim()
    : "";
  const changing =
    changeLead.test(dictation) ||
    (request.action === "change" &&
      changeVerbs.test(beforeCorrection(dictation)));
  if (changing)
    return change(
      { ...request, event: eventWords(request.event, dictation) },
      snapshot,
      now,
      dictation,
      location,
    );
  return add(request, snapshot, now, settings, dictation, location);
}

function add(
  request: Request,
  snapshot: Snapshot,
  now: Date,
  settings: Settings,
  dictation: string,
  location: string,
): Plan {
  const calendars = calendarLabels(snapshot.calendars);
  const label = [...calendars.keys()].find((label) => says(dictation, label));
  const calendar =
    (label && calendars.get(label)) ||
    calendars.get(settings.calendar) ||
    snapshot.defaultCalendar;
  if (!calendar)
    throw new CalendarError(
      "No calendar to add to. Pick one in the extension's settings",
    );
  const when = parseWhen(without(dictation, [location]), now);
  return {
    action: "add",
    calendar,
    title: request.title.trim() || "Busy",
    location,
    ...addedTimes(when, snapshot.events, now, settings),
  };
}

function addedTimes(
  when: When,
  events: CalendarEvent[],
  now: Date,
  settings: Settings,
) {
  const minutes = when.minutes ?? settings.minutes;
  if (!when.start && !when.end)
    return freeSlot(events, when, minutes, now, settings);
  const day = when.day ?? upcomingDay(when, now);
  const start = when.start
    ? at(day, when.start).getTime()
    : roundUp(now.getTime());
  const end = when.end ? at(day, when.end).getTime() : start + minutes * minute;
  return checked(start, end);
}

function upcomingDay(when: When, now: Date) {
  const today = midnight(now);
  if (!when.start) return today;
  const later = at(today, when.start).getTime() >= now.getTime() - lateGrace;
  return later ? today : addDays(today, 1);
}

function change(
  request: Request,
  snapshot: Snapshot,
  now: Date,
  dictation: string,
  location: string,
): Plan {
  if (!request.event.trim())
    throw new CalendarError("Which event? Say its name or time");
  const event = findEvent(snapshot.events, request.event, now);
  const when = parseWhen(without(dictation, [request.event, location]), now);
  const renamed = request.title.trim();
  const title =
    renameWords.test(dictation) &&
    renamed &&
    renamed.toLowerCase() !== event.title.toLowerCase()
      ? renamed
      : event.title;
  const before = {
    title: event.title,
    location: event.location,
    start: event.start,
    end: event.end,
  };
  const next = {
    title,
    location: location || event.location,
    ...changedTimes(event, when, dictation),
  };
  const unchanged = (Object.keys(before) as (keyof Details)[]).every(
    (key) => before[key] === next[key],
  );
  if (unchanged)
    throw new CalendarError(
      `What should change about ${event.title}? Say a new time, length, name or place`,
    );
  return {
    action: "update",
    id: event.id,
    occurrence: event.start,
    before,
    ...next,
  };
}

function changedTimes(event: CalendarEvent, when: When, dictation: string) {
  const length = event.end - event.start;
  const original = new Date(event.start);
  const day = when.day ?? midnight(original);
  let start =
    when.start || when.day
      ? at(day, when.start ?? clockOf(original)).getTime()
      : event.start;
  if (when.end) return checked(start, at(new Date(start), when.end).getTime());
  if (when.minutes === undefined) return checked(start, start + length);
  const amount = when.minutes * minute;
  if (extendWords.test(dictation))
    return checked(start, start + length + amount);
  if (shortenWords.test(dictation))
    return checked(start, start + length - amount);
  if (!when.start && shiftWords.test(dictation)) {
    start += earlierWords.test(dictation) ? -amount : amount;
    return checked(start, start + length);
  }
  return checked(start, start + amount);
}

function checked(start: number, end: number) {
  if (end <= start)
    throw new CalendarError("That would end before it starts. Say it again");
  return { start, end };
}

export function calendarLabels(calendars: CalendarInfo[]) {
  const counts = count(calendars.map((calendar) => calendar.title));
  return new Map(
    calendars.map((calendar) => [
      counts.get(calendar.title)! > 1
        ? `${calendar.title} (${calendar.account})`
        : calendar.title,
      calendar.id,
    ]),
  );
}

export function describe(plan: Plan) {
  const times = `${dayTime(plan.start)} to ${time(plan.end)}`;
  if (plan.action === "add")
    return `Added ${plan.title}, ${times}${plan.location ? ` at ${plan.location}` : ""}`;
  const { before } = plan;
  const moved = before.start !== plan.start || before.end !== plan.end;
  const renamed = before.title !== plan.title;
  const relocated = before.location !== plan.location;
  const onlyEnd = before.start === plan.start && before.end !== plan.end;
  if (onlyEnd && !renamed && !relocated)
    return `${before.title} now ends at ${time(plan.end)}`;
  if (moved && !renamed && !relocated)
    return `Moved ${before.title} to ${times}`;
  const changes = [
    moved && times,
    renamed && `renamed to ${plan.title}`,
    relocated && `at ${plan.location}`,
  ].filter(Boolean);
  return `Updated ${before.title}: ${changes.join(", ")}`;
}

export function undoing(plan: Plan, id: string) {
  if (plan.action === "add")
    return {
      command: "remove" as const,
      input: { id, occurrence: plan.start },
      message: `Removed ${plan.title}`,
    };
  return {
    command: "update" as const,
    input: { id: plan.id, occurrence: plan.start, ...plan.before },
    message: `Put ${plan.before.title} back to ${dayTime(plan.before.start)} to ${time(plan.before.end)}`,
  };
}

function eventWords(phrase: string, dictation: string) {
  const said = new Set(words(dictation));
  const kept = words(phrase).filter((word) => said.has(word));
  const owner = dictation.match(ownerDay)?.[0];
  const ownedBySpan =
    owner && !kept.includes(owner.toLowerCase().replace("'s", ""));
  return [...(ownedBySpan ? [owner] : []), ...kept].join(" ");
}

function without(text: string, phrases: string[]) {
  let rest = text;
  for (const phrase of phrases.map((phrase) => phrase.trim()).filter(Boolean)) {
    const index = rest.toLowerCase().indexOf(phrase.toLowerCase());
    if (index >= 0) {
      rest = `${rest.slice(0, index)} ${rest.slice(index + phrase.length)}`;
      continue;
    }
    const drop = new Set(words(phrase));
    rest = rest.replace(/[\p{L}\p{N}]+/gu, (word) =>
      drop.has(word.toLowerCase()) ? " " : word,
    );
  }
  return rest;
}

function says(dictation: string, phrase: string) {
  const said = new Set(words(dictation));
  const needed = words(phrase);
  return needed.length > 0 && needed.every((word) => said.has(word));
}

function dayTime(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function time(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function count(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
