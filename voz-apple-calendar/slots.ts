import { CalendarError, type CalendarEvent } from "./events";
import { addDays, midnight, type Part, type When } from "./times";

export type WorkDay = { dayStart: number; dayEnd: number };
type Slot = { start: number; end: number };

const minute = 60_000;
const step = 15 * minute;
const searchDays = 7;
const eveningEnd = 22;

export function freeSlot(
  events: CalendarEvent[],
  when: When,
  minutes: number,
  now: Date,
  work: WorkDay,
): Slot {
  const length = minutes * minute;
  const busy = events
    .filter((event) => !event.allDay && !event.free)
    .toSorted((a, b) => a.start - b.start);
  const [from, to] = hours(when.part, work);
  for (const day of days(when, now)) {
    let cursor = Math.max(atHour(day, from), roundUp(now.getTime()));
    const close = atHour(day, to);
    for (const event of busy) {
      if (event.end <= cursor || event.start >= close) continue;
      if (event.start - cursor >= length) break;
      cursor = Math.max(cursor, roundUp(event.end));
    }
    if (close - cursor >= length)
      return { start: cursor, end: cursor + length };
  }
  throw new CalendarError(
    `No free ${minutes} minutes in that time. Say a time instead`,
  );
}

export function days(when: When, now: Date): Date[] {
  if (when.day) return [when.day];
  const today = midnight(now);
  if (when.part === "evening") return [today];
  const start =
    when.week === "next" ? addDays(today, 8 - (today.getDay() || 7)) : today;
  const count =
    when.week === "next"
      ? 5
      : when.week === "this"
        ? 6 - (today.getDay() || 7) + 1
        : searchDays;
  return Array.from({ length: count }, (_, index) =>
    addDays(start, index),
  ).filter((day) => day.getDay() !== 0 && day.getDay() !== 6);
}

function hours(part: Part | undefined, { dayStart, dayEnd }: WorkDay) {
  if (part === "morning") return [dayStart, 12];
  if (part === "afternoon") return [12, dayEnd];
  if (part === "evening") return [Math.max(dayEnd, 17), eveningEnd];
  return [dayStart, dayEnd];
}

function atHour(day: Date, hour: number) {
  const date = new Date(day);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

export function roundUp(time: number) {
  return Math.ceil(time / step) * step;
}
