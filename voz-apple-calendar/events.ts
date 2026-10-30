import { clockOf, midnight, minutesOf, parseWhen } from "./times";

export type CalendarEvent = {
  id: string;
  title: string;
  start: number;
  end: number;
  location: string;
  allDay: boolean;
  free: boolean;
  invited: boolean;
  writable: boolean;
};

export class CalendarError extends Error {}

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
  "den",
  "dem",
  "von",
]);
const genericWords = new Set([
  "meeting",
  "meetings",
  "event",
  "appointment",
  "termin",
  "call",
  "block",
  "slot",
  "entry",
  "eintrag",
  "calendar",
  "kalender",
  "next",
  "upcoming",
  "current",
  "one",
  "this",
  "today",
  "tomorrow",
  "heute",
  "morgen",
  "nächste",
  "nächsten",
  "nächstes",
]);
const timeWords =
  /^(?:\d+(?:am|pm)?|am|pm|uhr|clock|at|um|on|today|tonight|tomorrow|morgen|heute|monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|morning|afternoon|evening)$/;

export function findEvent(
  events: CalendarEvent[],
  phrase: string,
  now: Date,
): CalendarEvent {
  const named = parseWhen(phrase, now);
  const titleWords = significantWords(phrase).filter(
    (word) => !timeWords.test(word),
  );
  let candidates = events
    .filter((event) => !event.allDay)
    .toSorted((a, b) => a.start - b.start);
  if (named.day) {
    const day = named.day.getTime();
    candidates = candidates.filter(
      (event) => midnight(new Date(event.start)).getTime() === day,
    );
  }
  if (named.start) {
    const minutes = minutesOf(named.start);
    candidates = candidates.filter(
      (event) => minutesOf(clockOf(new Date(event.start))) === minutes,
    );
  }
  const scored = candidates.map((event) => ({
    event,
    score: sharedWords(titleWords, event.title),
  }));
  const best = Math.max(0, ...scored.map(({ score }) => score));
  const onlyGeneric = titleWords.every((word) => genericWords.has(word));
  if (best === 0 && !onlyGeneric)
    throw new CalendarError(`No event matches "${phrase.trim()}"`);
  if (best === 0 && !named.start && !named.day && !named.next && !named.current)
    throw new CalendarError(`Which event? Say its name or time`);
  const matching = scored
    .filter(({ score }) => score === best)
    .map(({ event }) => event);
  const time = now.getTime();
  const pick = named.current
    ? matching.find((event) => event.start <= time && time < event.end)
    : named.next
      ? matching.find((event) => event.start > time)
      : matching.find((event) => event.end > time) ?? matching.at(-1);
  if (!pick) throw new CalendarError(`No event matches "${phrase.trim()}"`);
  if (pick.invited)
    throw new CalendarError(
      `${pick.title} is organized by someone else, so Voz leaves it alone`,
    );
  if (!pick.writable)
    throw new CalendarError(`${pick.title} is in a calendar you can't edit`);
  return pick;
}

function sharedWords(said: string[], title: string) {
  const titleWords = significantWords(title);
  return said.filter((word) =>
    titleWords.some((other) => sameWord(word, other)),
  ).length;
}

function sameWord(a: string, b: string) {
  if (a === b) return true;
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

function significantWords(text: string) {
  return words(text.replace(/-/g, "")).filter(
    (word) => word.length > 2 && !commonWords.has(word),
  );
}

export function words(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
