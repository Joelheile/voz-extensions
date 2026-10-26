import { expect, test } from "bun:test";
import { calendarLabels, describe, plan, type Snapshot } from "./calendar";

const monday = new Date(2026, 9, 26, 10, 0);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();
const snapshot: Snapshot = {
  calendars: [
    { id: "work", title: "Arbeit", account: "iCloud" },
    { id: "home-1", title: "Privat", account: "iCloud" },
    { id: "home-2", title: "Privat", account: "Google" },
  ],
  defaultCalendar: "home-1",
  events: [
    {
      id: "standup-2",
      title: "Standup",
      start: at(27, 11),
      end: at(27, 11, 15),
    },
    { id: "deep", title: "Deep work", start: at(27, 9), end: at(27, 11) },
    {
      id: "standup-1",
      title: "Standup",
      start: at(26, 11),
      end: at(26, 11, 15),
    },
    {
      id: "dinner",
      title: "Dinner with Lisa",
      start: at(29, 19),
      end: at(29, 21),
    },
  ],
};
const defaults = { minutes: 60, calendar: "" };
const add = (title: string, dictation: string, settings = defaults) =>
  plan({ action: "add", title }, snapshot, monday, settings, dictation);
const move = (dictation: string, title = "Deep work") =>
  plan({ action: "move", title }, snapshot, monday, defaults, dictation);

test("labels tell calendars with the same name apart", () => {
  expect([...calendarLabels(snapshot.calendars).keys()]).toEqual([
    "Arbeit",
    "Privat (iCloud)",
    "Privat (Google)",
  ]);
});

test("adds an event at the spoken time, length and calendar", () => {
  expect(
    add("Focus", "focus tomorrow at 2pm for 90 minutes in Arbeit"),
  ).toEqual({
    action: "add",
    calendar: "work",
    title: "Focus",
    start: at(27, 14),
    end: at(27, 15, 30),
  });
  expect(add("Writing", "writing from 3pm to 5pm today")).toMatchObject({
    calendar: "home-1",
    start: at(26, 15),
    end: at(26, 17),
  });
  expect(
    add("Dentist", "dentist Wednesday at 8:30 in privat google, 45 minutes"),
  ).toMatchObject({
    calendar: "home-2",
    start: at(28, 8, 30),
    end: at(28, 9, 15),
  });
  expect(add("Fokus", "Fokus morgen um 9 für 2 Stunden")).toMatchObject({
    start: at(27, 9),
    end: at(27, 11),
  });
});

test("falls back to the default length and the settings or system calendar", () => {
  expect(add("Gym", "gym Thursday 7am")).toMatchObject({
    calendar: "home-1",
    start: at(29, 7),
    end: at(29, 8),
  });
  expect(
    add("Gym", "gym at 6pm", { minutes: 30, calendar: "Arbeit" }),
  ).toMatchObject({ calendar: "work", end: at(26, 18, 30) });
});

test("moving keeps what the user did not say: day, time or length", () => {
  const moved = move("move deep work to 3pm");
  expect(moved).toEqual({
    action: "move",
    id: "deep",
    title: "Deep work",
    start: at(27, 15),
    end: at(27, 17),
  });
  expect(move("push deep work to Friday")).toMatchObject({
    start: at(30, 9),
    end: at(30, 11),
  });
  expect(move("deep work to Friday at 8am")).toMatchObject({
    start: at(30, 8),
    end: at(30, 10),
  });
  expect(move("verschiebe deep work auf Donnerstag 12 Uhr")).toMatchObject({
    start: at(29, 12),
  });
  expect(describe(moved)).toBe("Moved Deep work, Tue 3:00 PM to 5:00 PM");
});

test("changes an event's length", () => {
  expect(move("make deep work 3 hours")).toMatchObject({
    start: at(27, 9),
    end: at(27, 12),
  });
  expect(move("extend deep work by 30 minutes")).toMatchObject({
    end: at(27, 11, 30),
  });
  expect(move("shorten deep work by 30 minutes")).toMatchObject({
    end: at(27, 10, 30),
  });
});

test("asks for what's missing instead of guessing", () => {
  expect(() => move("move it to 3pm")).toThrow("Which event");
  expect(() => move("move the meeting to 3pm")).toThrow("Which event");
  expect(() => add("Gym", "gym tomorrow")).toThrow("Say a time");
  expect(move("block 3pm for writing", "Writing")).toMatchObject({
    action: "add",
    title: "Writing",
  });
});

test("picks the event whose name the user said, the next one first", () => {
  expect(move("push dinner with Lisa to Friday", "Dinner")).toMatchObject({
    id: "dinner",
    start: at(30, 19),
  });
  expect(move("move standup to 12pm")).toMatchObject({
    id: "standup-1",
    start: at(26, 12),
  });
  expect(() => move("move standup to 12")).toThrow("Say a new time");
});
