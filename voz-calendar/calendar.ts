import * as chrono from "chrono-node";

export type CalendarInfo = { id: string; title: string; account: string };
export type CalendarEvent = {
  id: string;
  title: string;
  start: number;
  end: number;
};
export type Snapshot = {
  calendars: CalendarInfo[];
  defaultCalendar: string | null;
  events: CalendarEvent[];
};

export type Request = { action: "add" | "move"; title: string };

export type Plan =
  | {
      action: "add";
      calendar: string;
      title: string;
      start: number;
      end: number;
    }
  | { action: "move"; id: string; title: string; start: number; end: number };

type Spoken = { day?: Date; hour?: Date; minutes?: number; change?: boolean };

const minute = 60_000;
const dayComponents: chrono.Component[] = ["day", "weekday", "month"];
const changeWords =
  /\b(move|push|shift|reschedule|postpone|pull|bring|extend|shorten|verschieb\w*|verleg\w*|verlänger\w*|kürz\w*)\b/i;
const shortenWords = /\b(shorten|cut|kürz\w*)\b/i;
const commonWords = new Set([
  "the",
  "with",
  "and",
  "for",
  "mit",
  "und",
  "der",
  "die",
  "das",
]);
const lengthWords = /\b(minutes?|mins?|hours?|hrs?|stunden?|minuten?)\b/i;

export const instructions = `You turn a dictated calendar request into fields.
- action: "add" for a new event or time block, "move" to change the time or length of an existing event
- title: a short title for the event, such as "Deep work" or "Dentist"

Example: "deep work tomorrow at 9 for 2 hours"
{"action": "add", "title": "Deep work"}

Example: "push dinner with Lisa to Friday"
{"action": "move", "title": "Dinner with Lisa"}`;

export const schema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add", "move"] },
    title: { type: "string", description: "Short event title" },
  },
  required: ["action", "title"],
} as const;

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

export function plan(
  request: Request,
  snapshot: Snapshot,
  now: Date,
  defaults: { minutes: number; calendar: string },
  dictation: string,
): Plan {
  const calendars = calendarLabels(snapshot.calendars);
  const said = spoken(dictation, now);
  const event =
    request.action === "move" && namedEvent(snapshot.events, dictation);
  if (request.action === "move" && !event && changeWords.test(dictation))
    throw new Error("Which event? Say its name");
  if (event) {
    if (!said.day && !said.hour && !said.minutes)
      throw new Error(
        `Say a new time or length, such as "to 3pm" or "2 hours"`,
      );
    const start = startTime(said, new Date(event.start))!;
    const length = (event.end - event.start) / minute;
    const minutes = said.change
      ? length + (said.minutes ?? 0) * (shortenWords.test(dictation) ? -1 : 1)
      : said.minutes ?? length;
    return {
      action: "move",
      id: event.id,
      title: event.title,
      start,
      end: start + minutes * minute,
    };
  }
  const label = [...calendars.keys()].find((label) => says(dictation, label));
  const calendar =
    (label && calendars.get(label)) ||
    calendars.get(defaults.calendar) ||
    snapshot.defaultCalendar;
  if (!calendar)
    throw new Error(
      "No calendar to add to. Pick one in the extension's settings",
    );
  const start = startTime(said);
  if (start === undefined)
    throw new Error(`Say a time, such as "tomorrow at 9am"`);
  return {
    action: "add",
    calendar,
    title: request.title || "Busy",
    start,
    end: start + (said.minutes ?? defaults.minutes) * minute,
  };
}

function spoken(dictation: string, now: Date): Spoken {
  for (const parser of [chrono, chrono.de]) {
    const results = parser
      .parse(dictation, now, { forwardDate: true })
      .filter((result) => result.text.length > 2);
    if (!results.length) continue;
    const times = results.filter((result) => !lengthWords.test(result.text));
    const length = results.find((result) => lengthWords.test(result.text));
    const range = times.find((result) => result.end);
    return {
      day: times
        .find((result) =>
          dayComponents.some((component) => result.start.isCertain(component)),
        )
        ?.start.date(),
      hour: times
        .find((result) => result.start.isCertain("hour"))
        ?.start.date(),
      minutes: range
        ? (range.end!.date().getTime() - range.start.date().getTime()) / minute
        : length &&
          Math.round((length.start.date().getTime() - now.getTime()) / minute),
      change: length && /\bby\s*$/i.test(dictation.slice(0, length.index)),
    };
  }
  return {};
}

function startTime({ day, hour }: Spoken, original?: Date) {
  if (!day && !hour) return original?.getTime();
  if (!hour && !original) return undefined;
  const start = new Date((hour ?? day)!);
  const date = day ?? original;
  if (date)
    start.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  if (!hour) start.setHours(original!.getHours(), original!.getMinutes(), 0, 0);
  return start.getTime();
}

function namedEvent(events: CalendarEvent[], dictation: string) {
  let best: CalendarEvent | undefined;
  for (const event of events.toSorted((a, b) => a.start - b.start))
    if (
      sharedWords(dictation, event.title) >
      (best ? sharedWords(dictation, best.title) : 0)
    )
      best = event;
  return best;
}

function sharedWords(dictation: string, title: string) {
  const said = new Set(words(dictation));
  return words(title).filter(
    (word) => word.length > 2 && !commonWords.has(word) && said.has(word),
  ).length;
}

function says(dictation: string, label: string) {
  const said = new Set(words(dictation));
  return words(label).every((word) => said.has(word));
}

function words(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function describe(plan: Plan) {
  const start = new Date(plan.start).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const end = new Date(plan.end).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${plan.action === "add" ? "Added" : "Moved"} ${plan.title}, ${start} to ${end}`;
}

function count(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
