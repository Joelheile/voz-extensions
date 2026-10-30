import * as chrono from "chrono-node";

type Clock = { hour: number; minute: number };
export type Part = "morning" | "afternoon" | "evening";
export type When = {
  day?: Date;
  start?: Clock;
  end?: Clock;
  minutes?: number;
  week?: "this" | "next";
  part?: Part;
  next?: boolean;
  current?: boolean;
};

const dayComponents: chrono.Component[] = ["day", "weekday", "month"];
const correctionWords =
  /\b(?:oh no|no wait|actually|i mean|sorry|ich meine|nein|doch lieber)\b/gi;
const hourNumbers = new Map(
  [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ].map((word, index) => [word, index + 1]),
);
const minuteNumbers = new Map([
  ["oh five", 5],
  ["ten", 10],
  ["fifteen", 15],
  ["twenty", 20],
  ["twenty five", 25],
  ["thirty", 30],
  ["thirty five", 35],
  ["forty", 40],
  ["forty five", 45],
  ["fifty", 50],
  ["fifty five", 55],
]);
const amounts = new Map([
  ["a", 1],
  ["an", 1],
  ["one", 1],
  ["eine", 1],
  ["einer", 1],
  ["two", 2],
  ["zwei", 2],
  ["three", 3],
  ["drei", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["ten", 10],
  ["fifteen", 15],
  ["twenty", 20],
  ["thirty", 30],
  ["forty five", 45],
  ["forty", 40],
  ["sixty", 60],
  ["ninety", 90],
]);
const hourWord = `(${alternatives([...hourNumbers.keys()])})`;
const minuteWord = `(${alternatives([...minuteNumbers.keys()])})`;
const amountWord = alternatives([...amounts.keys()]);
const duration = new RegExp(
  `\\b(?:(half an?|quarter of an?|a quarter|eine halbe|einer halben|halbe)|(\\d+(?:[.,]\\d+)?|${amountWord})(\\s+and a half)?)\\s*(minutes?|mins?|hours?|hrs?|h|stunden?|std|minuten?)\\b(\\s+and a half)?`,
  "gi",
);
const startLead = "at|from|um|von|ab|starting|starts?|it";
const endLead = "until|till|til|bis|ends?(?: at)?|finish(?:es)?(?: at)?";
const clock = new RegExp(
  `(?:\\b(${startLead}|${endLead}|to|-)\\s*)?\\b(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?|uhr|o'?clock)?(?![\\d:])`,
  "gi",
);
const halfDay = 12;
const eveningPlans =
  /\b(?:dinner|drinks|party|evening|tonight|concert|date night|abendessen|abends?)\b/i;

export function beforeCorrection(text: string) {
  const first = [...text.matchAll(correctionWords)].at(0);
  return first ? text.slice(0, first.index) : text;
}

export function parseWhen(text: string, now: Date): When {
  const last = [...text.matchAll(correctionWords)].at(-1);
  if (!last) return parseOne(text, now);
  return corrected(
    parseOne(text.slice(0, last.index), now),
    parseOne(text.slice(last.index), now),
  );
}

function corrected(said: When, fix: When): When {
  const fixesOneEnd = fix.start && !fix.end && said.start && said.end;
  if (!fixesOneEnd) return { ...said, ...definedFields(fix) };
  const fromStart = Math.abs(minutesOf(fix.start!) - minutesOf(said.start!));
  const fromEnd = Math.abs(minutesOf(fix.start!) - minutesOf(said.end!));
  return fromEnd < fromStart
    ? { ...said, end: fix.start }
    : { ...said, start: fix.start };
}

function parseOne(text: string, now: Date): When {
  let rest = text;
  const when: When = {};
  rest = rest.replace(duration, (...match) => {
    when.minutes = durationMinutes(match);
    return " ";
  });
  rest = withDigitTimes(rest);
  if (/\b(?:next|nächste\w*) (?:week|woche)\b/i.test(rest)) when.week = "next";
  else if (/\b(?:this|diese) (?:week|woche)\b/i.test(rest)) when.week = "this";
  rest = rest.replace(
    /\b(?:next|this|nächste\w*|diese) (?:week|woche)\b/gi,
    " ",
  );
  when.part = partOfDay(rest);
  when.next = /\b(?:next|upcoming|nächste\w*)\b/i.test(rest);
  when.current =
    /\b(?:current|this one|right now|now|aktuell\w*|jetzig\w*)\b/i.test(rest);
  rest = rest.replace(/\b(?:noon|midday|mittag)\b/gi, "at 12");
  Object.assign(when, clocks(rest, eveningPlans.test(rest)));
  const day = namedDay(rest, now);
  if (day) when.day = day;
  if (/\b(?:today|tonight|heute)\b/i.test(rest) && !when.day)
    when.day = midnight(now);
  return definedFields(when);
}

function clocks(text: string, evening: boolean): Pick<When, "start" | "end"> {
  const found: { time: Clock; lead: string; explicit: boolean }[] = [];
  for (const match of text.matchAll(clock)) {
    const [, lead = "", hours, minutes = "0", suffix = ""] = match;
    const looksLikeTime = Boolean(suffix) || /[:.]/.test(match[0]);
    if (!lead && !looksLikeTime) continue;
    const hour = Number(hours);
    if (hour > 24 || Number(minutes) > 59) continue;
    found.push({
      time: {
        hour: withMeridiem(hour, suffix, evening),
        minute: Number(minutes),
      },
      lead: lead.toLowerCase(),
      explicit: /p\.?m|a\.?m|uhr/i.test(suffix),
    });
  }
  const ends = (lead: string) => new RegExp(`^(?:${endLead})$`).test(lead);
  const start = found.find(
    (entry, index) =>
      !ends(entry.lead) &&
      !(entry.lead === "to" && index > 0) &&
      entry.lead !== "-",
  );
  const end = found.find(
    (entry) =>
      entry !== start &&
      (ends(entry.lead) || entry.lead === "to" || entry.lead === "-"),
  );
  if (
    start &&
    end &&
    !end.explicit &&
    minutesOf(end.time) <= minutesOf(start.time)
  )
    end.time = { ...end.time, hour: end.time.hour + halfDay };
  return {
    ...(start && { start: start.time }),
    ...(end && { end: end.time }),
  };
}

function withMeridiem(hour: number, suffix: string, evening: boolean) {
  if (/p\.?m/i.test(suffix)) return hour < halfDay ? hour + halfDay : hour;
  if (/a\.?m/i.test(suffix)) return hour === halfDay ? 0 : hour;
  if (/uhr/i.test(suffix)) return hour;
  const afternoon = evening ? hour >= 1 && hour <= 11 : hour >= 1 && hour <= 6;
  return afternoon ? hour + halfDay : hour;
}

function namedDay(text: string, now: Date) {
  for (const parser of [chrono, chrono.de]) {
    const result = parser
      .parse(text, now, { forwardDate: true })
      .find(
        (result) =>
          isWholeWords(text, result.index, result.text.length) &&
          dayComponents.some((component) => result.start.isCertain(component)),
      );
    if (result) return midnight(result.start.date());
  }
  return undefined;
}

function isWholeWords(text: string, index: number, length: number) {
  const letter = /[\p{L}\p{N}]/u;
  return (
    !letter.test(text[index - 1] ?? "") &&
    !letter.test(text[index + length] ?? "")
  );
}

function partOfDay(text: string): Part | undefined {
  if (/\b(?:morning|vormittag\w*|morgens)\b/i.test(text)) return "morning";
  if (/\b(?:afternoon|after lunch|nachmittag\w*)\b/i.test(text))
    return "afternoon";
  if (/\b(?:evening|tonight|abend\w*)\b/i.test(text)) return "evening";
  return undefined;
}

function durationMinutes(match: string[]) {
  const [, fraction, amount, andHalfBefore, unit, andHalfAfter] = match;
  const isHours = /^h|^st/i.test(unit);
  if (fraction) {
    const quarter = /quarter/i.test(fraction);
    return isHours ? (quarter ? 15 : 30) : quarter ? 0.25 : 0.5;
  }
  const value =
    amounts.get(amount.toLowerCase().replace("-", " ")) ??
    Number(amount.replace(",", "."));
  const total = value + (andHalfBefore || andHalfAfter ? 0.5 : 0);
  return Math.round(isHours ? total * 60 : total);
}

function withDigitTimes(text: string) {
  const hour = (word: string) => hourNumbers.get(word.toLowerCase())!;
  const minutes = (word: string) =>
    String(minuteNumbers.get(word.toLowerCase().replace("-", " "))).padStart(
      2,
      "0",
    );
  return text
    .replace(
      new RegExp(`\\bhalf past ${hourWord}\\b`, "gi"),
      (_, h) => `${hour(h)}:30`,
    )
    .replace(
      new RegExp(`\\bquarter past ${hourWord}\\b`, "gi"),
      (_, h) => `${hour(h)}:15`,
    )
    .replace(
      new RegExp(`\\bquarter to ${hourWord}\\b`, "gi"),
      (_, h) => `${((hour(h) + 10) % 12) + 1}:45`,
    )
    .replace(
      new RegExp(`\\b${hourWord}[\\s-]+${minuteWord}\\b`, "gi"),
      (_, h, m) => `${hour(h)}:${minutes(m)}`,
    )
    .replace(
      new RegExp(`\\b${hourWord}\\s+o'?clock\\b`, "gi"),
      (_, h) => `${hour(h)} o'clock`,
    )
    .replace(
      new RegExp(
        `\\b(from|at|to|until|till|between|and|um|von|bis)\\s+${hourWord}\\b`,
        "gi",
      ),
      (_, before, h) => `${before} ${hour(h)}`,
    );
}

export function minutesOf({ hour, minute }: Clock) {
  return hour * 60 + minute;
}

export function at(day: Date, time: Clock) {
  const date = new Date(day);
  date.setHours(time.hour, time.minute, 0, 0);
  return date;
}

export function midnight(date: Date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function addDays(day: Date, count: number) {
  const date = new Date(day);
  date.setDate(date.getDate() + count);
  return date;
}

export function clockOf(date: Date): Clock {
  return { hour: date.getHours(), minute: date.getMinutes() };
}

function alternatives(words: string[]) {
  return `(?:${words
    .toSorted((a, b) => b.length - a.length)
    .map((word) => word.replace(" ", "[\\s-]"))
    .join("|")})`;
}

function definedFields<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, field]) => field !== undefined && field !== false,
    ),
  ) as T;
}
