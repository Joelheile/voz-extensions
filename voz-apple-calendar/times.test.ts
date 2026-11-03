import { expect, test } from "bun:test";
import { parseWhen } from "./times";

const monday = new Date(2026, 9, 26, 8, 40);
const day = (date: number) => new Date(2026, 9, date);

test("reads clock times the way people say them", () => {
  expect(parseWhen("move to 4", monday)).toEqual({
    start: { hour: 16, minute: 0 },
  });
  expect(parseWhen("at 9", monday).start).toEqual({ hour: 9, minute: 0 });
  expect(parseWhen("at 10 am", monday).start).toEqual({ hour: 10, minute: 0 });
  expect(parseWhen("my 3pm", monday).start).toEqual({ hour: 15, minute: 0 });
  expect(parseWhen("um 15 Uhr", monday).start).toEqual({ hour: 15, minute: 0 });
  expect(parseWhen("at noon", monday).start).toEqual({ hour: 12, minute: 0 });
  expect(parseWhen("the ten o'clock", monday).start).toEqual({
    hour: 10,
    minute: 0,
  });
  expect(parseWhen("at quarter to nine", monday).start).toEqual({
    hour: 8,
    minute: 45,
  });
});

test("reads ranges and end times", () => {
  expect(parseWhen("from 10 to 10:30", monday)).toEqual({
    start: { hour: 10, minute: 0 },
    end: { hour: 10, minute: 30 },
  });
  expect(parseWhen("from twelve to one thirty", monday)).toEqual({
    start: { hour: 12, minute: 0 },
    end: { hour: 13, minute: 30 },
  });
  expect(parseWhen("from 11 to 1", monday).end).toEqual({
    hour: 13,
    minute: 0,
  });
  expect(parseWhen("until 12", monday)).toEqual({
    end: { hour: 12, minute: 0 },
  });
  expect(parseWhen("end at 5", monday)).toEqual({
    end: { hour: 17, minute: 0 },
  });
  expect(parseWhen("bis 18 Uhr", monday)).toEqual({
    end: { hour: 18, minute: 0 },
  });
});

test("reads lengths without mistaking them for times", () => {
  expect(parseWhen("for 2 hours", monday)).toEqual({ minutes: 120 });
  expect(parseWhen("by 15 minutes", monday)).toEqual({ minutes: 15 });
  expect(parseWhen("half an hour", monday)).toEqual({ minutes: 30 });
  expect(parseWhen("an hour and a half", monday)).toEqual({ minutes: 90 });
  expect(parseWhen("90 min", monday)).toEqual({ minutes: 90 });
  expect(parseWhen("ten minutes later", monday)).toEqual({ minutes: 10 });
  expect(parseWhen("eine halbe Stunde", monday)).toEqual({ minutes: 30 });
});

test("reads days, weeks and parts of the day", () => {
  expect(parseWhen("tomorrow at 9", monday)).toEqual({
    day: day(27),
    start: { hour: 9, minute: 0 },
  });
  expect(parseWhen("Thursday afternoon", monday)).toEqual({
    day: day(29),
    part: "afternoon",
  });
  expect(parseWhen("morgen um 9", monday)).toEqual({
    day: day(27),
    start: { hour: 9, minute: 0 },
  });
  expect(parseWhen("tonight", monday)).toEqual({
    day: day(26),
    part: "evening",
  });
  expect(parseWhen("sometime next week", monday)).toEqual({ week: "next" });
});

test("uses the last time when a dictation corrects itself", () => {
  expect(
    parseWhen("to run from 10 to 10:30. Oh no, change to 10:45.", monday),
  ).toEqual({ start: { hour: 10, minute: 0 }, end: { hour: 10, minute: 45 } });
  expect(parseWhen("from 10 to 10:30. Actually, 9:30", monday)).toEqual({
    start: { hour: 9, minute: 30 },
    end: { hour: 10, minute: 30 },
  });
  expect(parseWhen("Friday, I mean Thursday", monday)).toEqual({
    day: day(29),
  });
});

test("ignores day words hidden inside other words", () => {
  expect(parseWhen("frühstück", monday)).toEqual({});
});

test("reads a bare hour as evening when the plan is an evening one", () => {
  expect(parseWhen("dinner with Lisa Saturday at 7", monday).start).toEqual({
    hour: 19,
    minute: 0,
  });
  expect(parseWhen("drinks at 8", monday).start).toEqual({
    hour: 20,
    minute: 0,
  });
  expect(parseWhen("gym at 7", monday).start).toEqual({ hour: 7, minute: 0 });
  expect(parseWhen("dinner at 7am", monday).start).toEqual({
    hour: 7,
    minute: 0,
  });
});

test("reads German dates with a year", () => {
  expect(parseWhen("Am 5.12.2026 ab 16 Uhr deutsche Zeit", monday)).toEqual({
    day: new Date(2026, 11, 5),
    start: { hour: 16, minute: 0 },
    zone: "Europe/Berlin",
  });
  expect(parseWhen("am 3.1.27 um 9 Uhr", monday)).toEqual({
    day: new Date(2027, 0, 3),
    start: { hour: 9, minute: 0 },
  });
  expect(parseWhen("am 5.12. ab 16 Uhr", monday).day).toEqual(
    new Date(2026, 11, 5),
  );
});

test("reads spoken time zones", () => {
  expect(parseWhen("ab 16 Uhr deutsche Zeit", monday)).toEqual({
    start: { hour: 16, minute: 0 },
    zone: "Europe/Berlin",
  });
  expect(parseWhen("at 9am New York time", monday).zone).toBe(
    "America/New_York",
  );
  expect(parseWhen("at 3 PST", monday).zone).toBe("America/Los_Angeles");
  expect(parseWhen("um 10 Uhr MEZ", monday).zone).toBe("Europe/Berlin");
  expect(parseWhen("was ist das um 10", monday).zone).toBeUndefined();
});

test("reads German lengths and end times", () => {
  expect(parseWhen("morgen um 10 für zwei Stunden", monday)).toEqual({
    day: day(27),
    start: { hour: 10, minute: 0 },
    minutes: 120,
  });
  expect(parseWhen("um 9 Uhr eine Stunde lang", monday)).toEqual({
    start: { hour: 9, minute: 0 },
    minutes: 60,
  });
  expect(parseWhen("ab 16 Uhr bis 18 Uhr", monday)).toEqual({
    start: { hour: 16, minute: 0 },
    end: { hour: 18, minute: 0 },
  });
  expect(parseWhen("von 10 bis 12", monday)).toEqual({
    start: { hour: 10, minute: 0 },
    end: { hour: 12, minute: 0 },
  });
  expect(parseWhen("für 45 Minuten", monday)).toEqual({ minutes: 45 });
  expect(parseWhen("anderthalb Stunden", monday)).toEqual({ minutes: 90 });
});

test("reads any city in the time zone database", () => {
  expect(parseWhen("at 9am Singapore time", monday)).toEqual({
    start: { hour: 9, minute: 0 },
    zone: "Asia/Singapore",
  });
  expect(parseWhen("um 10 Uhr São Paulo Zeit", monday).zone).toBe(
    "America/Sao_Paulo",
  );
  expect(parseWhen("lunch time at 12", monday).zone).toBeUndefined();
});
