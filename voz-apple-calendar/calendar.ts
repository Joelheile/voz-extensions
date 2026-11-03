import type { Answer, AskField, AskOptions } from "voz";
import { CalendarError, findEvent, words, type CalendarEvent } from "./events";
import { days, freeSlot, roundUp, type WorkDay } from "./slots";
import {
  addDays,
  at,
  beforeCorrection,
  clockOf,
  inZone,
  midnight,
  parseWhen,
  wallTime,
  zoneNames,
  type Clock,
  type When,
} from "./times";

export type { CalendarEvent } from "./events";

type CalendarInfo = { id: string; title: string; account: string };
export type Snapshot = {
  calendars: CalendarInfo[];
  defaultCalendar: string | null;
  events: CalendarEvent[];
};
export type Request = {
  action: "add" | "change" | "none";
  title: string;
  event: string;
  location: string;
  /** The calendar label the model picked, or "none" */
  calendar: string;
};
type Details = {
  title: string;
  location: string;
  start: number;
  end: number;
};
export type Plan = (
  | ({ action: "add"; calendar: string } & Details)
  | ({
      action: "update";
      id: string;
      occurrence: number;
      before: Details;
    } & Details)
) & { zone?: string };
type Settings = WorkDay & { minutes: number; calendar: string };

const minute = 60_000;
const lateGrace = 15 * minute;
const changeLead =
  /^\W*(?:(?:change|move|update) calendar|(?:add to )?calendar\W+(?:please\W+)?(?:move|push|pull(?! request)|reschedule|extend|shorten|rename|change|update|delay|postpone|verschieb\w*|änder\w*))\b/i;
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
const calendarWord = /\b(?:calendars?|kalender)\b/i;
const shiftWords =
  /\b(?:by|later|earlier|push|pull|delay|postpone|back|forward|später|früher|um)\b/i;

export const instructions = `You read a dictated calendar request and fill in fields. Speech recognition wrote the dictation, so it can have misheard words, fillers and repeats.
- action: "add" when they ask to put a new event or time block into their calendar. "change" when they ask to move, resize, rename or relocate an event already in it, such as "move", "push", "change", "extend" or "rename". "none" when they only talk about a calendar without asking to put or change anything in it: their calendar is full, they will check it, they ask someone else for an invite, or they talk about a calendar app.
- title: for add, the title a person would type into their calendar, in the dictation's language. Include who and what, such as "Lunch with Tom" or "Call with Sarah about the pitch deck". Fix misheard words from context, such as "fyg" for "für", and drop fillers and repeats. Leave out the date, time, time zone, place, and words about the calendar itself, such as "calendar", "Kalender", "add" or "mit Location". For change, the new name only if they rename it, else "".
- event: for change, the words that name the existing event, copied from the dictation, without the new time. For add, "".
- location: the place they name, such as a café, room, town or address, copied from the dictation. A time zone such as "New York time" or "deutsche Zeit" is not a place. Else "".

Example: "calendar deep work tomorrow at 9 for 2 hours"
{"action":"add","title":"Deep work","event":"","location":""}

Example: "calendar um lunch with uh Tom on Friday at noon at Café Nero"
{"action":"add","title":"Lunch with Tom","event":"","location":"Café Nero"}

Example: "kalender fyg Lisa Geburtstag am 3.4. um 18 Uhr mit Location Hamburg"
{"action":"add","title":"Lisas Geburtstag","event":"","location":"Hamburg"}

Example: "calendar call with Ana at 9am London time about the the budget"
{"action":"add","title":"Call with Ana about the budget","event":"","location":""}

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

Example: "I'll check my calendar and let you know"
{"action":"none","title":"","event":"","location":""}

Example: "Mein Kalender ist morgen voll, lass uns Freitag reden"
{"action":"none","title":"","event":"","location":""}

Example: "calendar move lunch with Tom to Café Luna"
{"action":"change","title":"","event":"lunch with Tom","location":"Café Luna"}`;

export function request(dictation: string) {
  return {
    instructions,
    prompt: `Dictation: ${dictation}`,
    schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "change", "none"] },
        title: { type: "string", description: "Short title, or the new name" },
        event: {
          type: "string",
          description: "Words naming the existing event",
        },
        location: { type: "string", description: "Place, or empty" },
      },
      required: ["action", "title", "event", "location"],
    },
  } as const;
}

// The small model picks better when this is the only question
export function calendarRequest(title: string, calendars: CalendarInfo[]) {
  const labels = [...calendarLabels(calendars).keys()];
  return {
    instructions: `You choose which of a person's calendars an event belongs in. Pick the calendar whose name fits the event best. Work meetings and calls go in a work calendar. Lectures and courses go in a university or school calendar. Family events and birthdays go in a family calendar. Doctors, friends, sports and errands go in a private or home calendar. Answer "none" when no name fits.`,
    prompt: `Calendars: ${labels.join(", ")}\nEvent: ${title}`,
    schema: {
      type: "object",
      properties: { calendar: { type: "string", enum: [...labels, "none"] } },
      required: ["calendar"],
    },
  } as const;
}

export function plan(
  request: Request,
  snapshot: Snapshot,
  now: Date,
  settings: Settings,
  dictation: string,
): Plan {
  const place = request.location.trim();
  const location = isPlace(
    place,
    request.title,
    dictation,
    snapshot.calendars,
    now,
  )
    ? place
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

// The model sometimes hands back the title, a time, a time zone or a calendar as the place
function isPlace(
  place: string,
  title: string,
  dictation: string,
  calendars: CalendarInfo[],
  now: Date,
) {
  return (
    says(dictation, place) &&
    place.toLowerCase() !== title.trim().toLowerCase() &&
    Object.keys(parseWhen(place, now)).length === 0 &&
    !calendarWord.test(place) &&
    !namedCalendar(place, calendars)
  );
}

function add(
  request: Request,
  snapshot: Snapshot,
  now: Date,
  settings: Settings,
  dictation: string,
  location: string,
): Plan {
  const labels = calendarLabels(snapshot.calendars);
  const calendar =
    namedCalendar(dictation, snapshot.calendars) ||
    labels.get(request.calendar) ||
    labels.get(settings.calendar) ||
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
    ...(when.zone && { zone: when.zone }),
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
  const day =
    when.day ??
    (when.week === "next" ? days(when, now)[0] : upcomingDay(when, now));
  const start = when.start
    ? spokenTime(day, when.start, when.zone)
    : roundUp(now.getTime());
  const end = when.end
    ? spokenTime(day, when.end, when.zone)
    : start + minutes * minute;
  return checked(start, end);
}

function upcomingDay(when: When, now: Date) {
  const today = midnight(now);
  if (!when.start) return today;
  const later =
    spokenTime(today, when.start, when.zone) >= now.getTime() - lateGrace;
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
    ...(when.zone && { zone: when.zone }),
  };
}

function changedTimes(event: CalendarEvent, when: When, dictation: string) {
  const length = event.end - event.start;
  const original = new Date(event.start);
  const day = when.day ?? midnight(original);
  let start = when.start
    ? spokenTime(day, when.start, when.zone)
    : when.day
      ? at(day, clockOf(original)).getTime()
      : event.start;
  if (when.end) return checked(start, spokenTime(day, when.end, when.zone));
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

function spokenTime(day: Date, clock: Clock, zone?: string) {
  return inZone(at(day, clock), zone).getTime();
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

/** The calendar they name, not counting the word "calendar" that triggers the extension */
export function namedCalendar(dictation: string, calendars: CalendarInfo[]) {
  const labels = calendarLabels(calendars);
  const spoken = dictation.split(calendarWord).join(" ");
  const label = [...labels.keys()].find((label) => says(spoken, label));
  return label && labels.get(label);
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

export function confirmation(
  plan: Plan,
  calendars: CalendarInfo[],
): AskOptions {
  const shown = (moment: number) => wallTime(moment, plan.zone).getTime();
  const fields: AskField[] = [
    { id: "title", label: "Title", type: "text", value: plan.title },
    { id: "start", label: "Starts", type: "date", value: shown(plan.start) },
    { id: "end", label: "Ends", type: "date", value: shown(plan.end) },
    ...(plan.zone ? [zoneField(plan.zone)] : []),
    { id: "location", label: "Location", type: "text", value: plan.location },
  ];
  if (plan.action === "update")
    return {
      title: `Change ${plan.before.title}?`,
      fields,
      buttons: ["Copy", "Save"],
    };
  const labels = calendarLabels(calendars);
  const chosen = [...labels].find(([, id]) => id === plan.calendar)?.[0] ?? "";
  return {
    title: "Add to calendar?",
    fields: [
      ...fields,
      {
        id: "calendar",
        label: "Calendar",
        type: "choice",
        value: chosen,
        options: [...labels.keys()],
      },
    ],
    buttons: ["Copy", "Add"],
  };
}

export function edited(
  plan: Plan,
  values: NonNullable<Answer>["values"],
  calendars: CalendarInfo[],
): Plan {
  const zone = values.zone
    ? zoneLabels(plan.zone!).get(String(values.zone))
    : undefined;
  const moment = (shown: unknown) =>
    inZone(new Date(Number(shown)), zone).getTime();
  const details = {
    title: String(values.title).trim() || plan.title,
    location: String(values.location).trim(),
    ...checked(moment(values.start), moment(values.end)),
  };
  if (plan.action === "update") return { ...plan, ...details };
  const calendar = calendarLabels(calendars).get(String(values.calendar));
  return { ...plan, ...details, calendar: calendar ?? plan.calendar };
}

// Starts and Ends show the wall time in this zone, so changing it moves the event
function zoneField(zone: string): AskField {
  const labels = [...zoneLabels(zone).keys()];
  return {
    id: "zone",
    label: "Time zone",
    type: "choice",
    value: labels[0],
    options: labels,
  };
}

function zoneLabels(spoken: string) {
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = new Set([spoken, here, ...zoneNames.map(([zone]) => zone)]);
  return new Map(
    [...zones].map((zone) => [
      zone.split("/").at(-1)!.replaceAll("_", " "),
      zone,
    ]),
  );
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
