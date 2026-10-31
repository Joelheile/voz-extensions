import { expect, test } from "bun:test";
import {
  calendarLabels,
  describe,
  plan,
  undoing,
  type CalendarEvent,
  type Request,
  type Snapshot,
} from "./calendar";

const now = new Date(2026, 9, 26, 8, 40);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();
const event = (
  id: string,
  title: string,
  start: number,
  end: number,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id,
  title,
  start,
  end,
  location: "",
  allDay: false,
  free: false,
  invited: false,
  writable: true,
  ...extra,
});
const snapshot: Snapshot = {
  calendars: [
    { id: "work", title: "Arbeit", account: "iCloud" },
    { id: "home-1", title: "Privat", account: "iCloud" },
    { id: "home-2", title: "Privat", account: "Google" },
  ],
  defaultCalendar: "home-1",
  events: [
    event("holiday", "Holiday", at(26, 0), at(27, 0), { allDay: true }),
    event("standup", "Stand-up", at(26, 9, 30), at(26, 9, 45)),
    event("board", "Board sync", at(26, 11), at(26, 12), { invited: true }),
    event("focus", "Focus", at(26, 13), at(26, 14), { free: true }),
    event("design", "Design review", at(26, 15), at(26, 16)),
    event("stoic", "daily stoic june - july", at(26, 21, 35), at(26, 22, 30)),
    event("standup", "Stand-up", at(27, 9, 30), at(27, 9, 45)),
    event("deep", "Deep work", at(27, 10), at(27, 12)),
    event("lunch", "Lunch with Tom", at(27, 12), at(27, 13)),
    event("offsite", "Team offsite", at(28, 10), at(28, 16), {
      writable: false,
    }),
  ],
};
const settings = { minutes: 60, calendar: "", dayStart: 9, dayEnd: 18 };
const add = (
  title: string,
  dictation: string,
  extra: Partial<Request> = {},
  changed = settings,
) =>
  plan(
    { action: "add", title, event: "", location: "", ...extra },
    snapshot,
    now,
    changed,
    dictation,
  );
const change = (
  eventWords: string,
  dictation: string,
  extra: Partial<Request> = {},
) =>
  plan(
    { action: "change", title: "", event: eventWords, location: "", ...extra },
    snapshot,
    now,
    settings,
    dictation,
  );

test("labels tell calendars with the same name apart", () => {
  expect([...calendarLabels(snapshot.calendars).keys()]).toEqual([
    "Arbeit",
    "Privat (iCloud)",
    "Privat (Google)",
  ]);
});

test("adds an event at the spoken time, length, calendar and place", () => {
  expect(
    add("Focus", "calendar focus tomorrow at 2pm for 90 minutes in Arbeit"),
  ).toEqual({
    action: "add",
    calendar: "work",
    title: "Focus",
    location: "",
    start: at(27, 14),
    end: at(27, 15, 30),
  });
  expect(
    add("Writing", "calendar writing from 3pm to 5pm today"),
  ).toMatchObject({ calendar: "home-1", start: at(26, 15), end: at(26, 17) });
  expect(
    add(
      "Dentist",
      "calendar dentist Wednesday at 8:30 in privat google, 45 minutes",
    ),
  ).toMatchObject({
    calendar: "home-2",
    start: at(28, 8, 30),
    end: at(28, 9, 15),
  });
  expect(
    add("Fokus", "calendar Fokus morgen um 9 für 2 Stunden"),
  ).toMatchObject({
    start: at(27, 9),
    end: at(27, 11),
  });
  expect(
    add(
      "Lunch with Tom",
      "calendar lunch with Tom on Friday at noon at Café Nero",
      {
        location: "Café Nero",
      },
    ),
  ).toMatchObject({
    start: at(30, 12),
    end: at(30, 13),
    location: "Café Nero",
  });
});

test("reads a bare hour as a work time and keeps it today when it's still ahead", () => {
  expect(add("Call mom", "calendar call mom at 4")).toMatchObject({
    start: at(26, 16),
    end: at(26, 17),
  });
  expect(add("Gym", "calendar gym at 8")).toMatchObject({ start: at(27, 8) });
  expect(
    add(
      "Gym",
      "calendar gym at 6pm",
      {},
      { ...settings, minutes: 30, calendar: "Arbeit" },
    ),
  ).toMatchObject({ calendar: "work", end: at(26, 18, 30) });
});

test("finds the first free time when no time is said", () => {
  expect(
    add("Report", "calendar find an hour this afternoon for the report"),
  ).toMatchObject({
    start: at(26, 12),
    end: at(26, 13),
  });
  expect(add("Report", "calendar report tomorrow")).toMatchObject({
    start: at(27, 13),
    end: at(27, 14),
  });
  expect(() => add("Report", "calendar report tomorrow morning")).toThrow(
    "No free 60 minutes",
  );
  expect(
    add("Prep", "calendar 15 minutes prep tomorrow morning"),
  ).toMatchObject({
    start: at(27, 9),
    end: at(27, 9, 15),
  });
  expect(() =>
    add("Offsite prep", "calendar 6 hours offsite prep tomorrow"),
  ).toThrow("No free 360 minutes");
});

test("moves an event named by its time and keeps its length", () => {
  const moved = change("my 3pm", "change calendar move my 3pm to 4");
  expect(moved).toEqual({
    action: "update",
    id: "design",
    occurrence: at(26, 15),
    title: "Design review",
    location: "",
    start: at(26, 16),
    end: at(26, 17),
    before: {
      title: "Design review",
      location: "",
      start: at(26, 15),
      end: at(26, 16),
    },
  });
  expect(describe(moved)).toBe("Moved Design review to Mon 4:00 PM to 5:00 PM");
  expect(
    change("deep work", "calendar push deep work to Friday"),
  ).toMatchObject({
    start: at(30, 10),
    end: at(30, 12),
  });
  expect(
    change("deep work", "calendar verschiebe deep work auf Donnerstag 12 Uhr"),
  ).toMatchObject({ start: at(29, 12), end: at(29, 14) });
});

test("changes one occurrence of a repeating event", () => {
  expect(
    change("standup", "calendar push standup by 15 minutes"),
  ).toMatchObject({
    id: "standup",
    occurrence: at(26, 9, 30),
    start: at(26, 9, 45),
    end: at(26, 10),
  });
  expect(
    change("tomorrow's standup", "calendar move tomorrow's standup to 10"),
  ).toMatchObject({
    occurrence: at(27, 9, 30),
    start: at(27, 10),
    end: at(27, 10, 15),
  });
  expect(
    change("standup", "calendar pull standup 10 minutes earlier"),
  ).toMatchObject({
    start: at(26, 9, 20),
  });
});

test("resizes an event", () => {
  expect(change("deep work", "calendar make deep work 3 hours")).toMatchObject({
    start: at(27, 10),
    end: at(27, 13),
  });
  expect(
    change("design review", "calendar extend the design review by 30 minutes"),
  ).toMatchObject({
    end: at(26, 16, 30),
  });
  expect(
    change("deep work", "calendar shorten deep work by 30 minutes"),
  ).toMatchObject({
    end: at(27, 11, 30),
  });
  expect(
    change("deep work", "calendar deep work should end at 11"),
  ).toMatchObject({
    start: at(27, 10),
    end: at(27, 11),
  });
  expect(
    change("my next meeting", "calendar make my next meeting 30 minutes"),
  ).toMatchObject({
    id: "standup",
    end: at(26, 10),
  });
});

test("renames and relocates without touching the time", () => {
  const renamed = change(
    "the design review",
    "calendar rename the design review to roadmap review",
    { title: "Roadmap review" },
  );
  expect(renamed).toMatchObject({
    title: "Roadmap review",
    start: at(26, 15),
    end: at(26, 16),
  });
  expect(describe(renamed)).toBe(
    "Updated Design review: renamed to Roadmap review",
  );
  expect(
    change("lunch with Tom", "calendar move lunch with Tom to Café Luna", {
      location: "Café Luna",
    }),
  ).toMatchObject({
    location: "Café Luna",
    start: at(27, 12),
    end: at(27, 13),
  });
  expect(
    change("deep work", "calendar move deep work to 3", {
      title: "Deep work at 3",
    }),
  ).toMatchObject({ title: "Deep work" });
});

test("treats a change verb as a change whatever the model picked", () => {
  expect(
    plan(
      { action: "add", title: "Standup", event: "standup", location: "" },
      snapshot,
      now,
      settings,
      "calendar push standup by 15 minutes",
    ),
  ).toMatchObject({ action: "update", id: "standup" });
});

test("refuses instead of guessing", () => {
  expect(() => change("", "change calendar move it to 3")).toThrow(
    "Which event",
  );
  expect(() => change("it", "calendar move it to 3pm")).toThrow("Which event");
  expect(() =>
    change("the meeting", "calendar move the meeting to 3pm"),
  ).toThrow("Which event");
  expect(() => change("the dentist", "calendar move the dentist to 3")).toThrow(
    'No event matches "the dentist"',
  );
  expect(() => change("board sync", "calendar move board sync to 2")).toThrow(
    "Board sync is organized by someone else",
  );
  expect(() =>
    change("team offsite", "calendar move team offsite to 11"),
  ).toThrow("calendar you can't edit");
  expect(() => change("deep work", "calendar change deep work")).toThrow(
    "What should change about Deep work",
  );
  expect(() =>
    change("deep work", "calendar deep work should end at 9"),
  ).toThrow("end before it starts");
});

test("undo reverses the last add or change", () => {
  const added = add("Report", "calendar report tomorrow at 2");
  expect(undoing(added, "new-id")).toEqual({
    command: "remove",
    input: { id: "new-id", occurrence: at(27, 14) },
    message: "Removed Report",
  });
  const moved = change("my 3pm", "calendar move my 3pm to 4");
  expect(undoing(moved, "design")).toEqual({
    command: "update",
    input: {
      id: "design",
      occurrence: at(26, 16),
      title: "Design review",
      location: "",
      start: at(26, 15),
      end: at(26, 16),
    },
    message: "Put Design review back to Mon 3:00 PM to 4:00 PM",
  });
});

test("trusts the dictation over the model's words", () => {
  expect(
    change(
      "the design review on Thursday",
      "calendar push the design review by half an hour",
    ),
  ).toMatchObject({ id: "design", start: at(26, 15, 30) });
  expect(
    change("standup", "calendar move tomorrow's standup to 10"),
  ).toMatchObject({ occurrence: at(27, 9, 30), start: at(27, 10) });
  expect(
    change(
      "call with Acme",
      "calendar call with Acme on Thursday from 3 to 3:30",
      { title: "Call with Acme" },
    ),
  ).toMatchObject({ action: "add", start: at(29, 15), end: at(29, 15, 30) });
  expect(
    change(
      "budget review with finance",
      "calendar budget review with finance at 2, oh no, make it 3",
      { title: "Budget review with finance" },
    ),
  ).toMatchObject({ action: "add", start: at(26, 15) });
  expect(
    change("my next meeting", "calendar my next meeting should end at 11"),
  ).toMatchObject({ action: "update", id: "standup", end: at(26, 11) });
});

test("the next meeting is the next one to start, not the one running now", () => {
  const during = new Date(2026, 9, 26, 13, 30);
  expect(
    plan(
      { action: "change", title: "", event: "my next meeting", location: "" },
      snapshot,
      during,
      settings,
      "calendar my next meeting should end at 4:30",
    ),
  ).toMatchObject({ id: "design", start: at(26, 15), end: at(26, 16, 30) });
});

test("says what changed in plain words", () => {
  expect(
    describe(
      change(
        "design review",
        "calendar extend the design review by 30 minutes",
      ),
    ),
  ).toBe("Design review now ends at 4:30 PM");
});

test("reads dates and times the way people dictate them", () => {
  expect(add("Termin", "calendar termin am 10.11. um 14 uhr")).toMatchObject({
    start: new Date(2026, 10, 10, 14).getTime(),
  });
  expect(add("Lunch", "calendar lunch at noon next week")).toMatchObject({
    start: new Date(2026, 10, 2, 12).getTime(),
  });
  expect(add("Call", "calendar call tomorrow um 10h")).toMatchObject({
    start: at(27, 10),
    end: at(27, 11),
  });
  expect(add("Meeting", "calendar meeting tomorrow 9 to 10am")).toMatchObject({
    start: at(27, 9),
    end: at(27, 10),
  });
});

test("adds a pull request review instead of moving an event", () => {
  expect(
    add("Pull request review", "calendar pull request review tomorrow at 3"),
  ).toMatchObject({ action: "add", start: at(27, 15) });
});
