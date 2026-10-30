import { expect, test } from "bun:test";
import { inbox, sourceScript, thingsURL, toTodo, withSource } from "./things";

const monday = new Date(2026, 9, 26, 10, 0);
const things = { lists: [], tags: ["Errands", "Prio 1"] };
const todo = (title: string, dictation: string, extra = {}) =>
  toTodo({ title, list: inbox, ...extra }, dictation, monday, things);

test("reads start dates, times and Things keywords from the dictation", () => {
  expect(todo("Call Milan", "call Milan tomorrow").when).toBe("2026-10-27");
  expect(todo("Call Milan", "call Milan Thursday at 3pm").when).toBe(
    "2026-10-29@15:00",
  );
  expect(todo("Call Milan", "call Milan tonight").when).toBe("evening");
  expect(todo("Read the paper", "read the paper someday").when).toBe("someday");
  expect(todo("Wäsche machen", "wäsche machen nächste Woche").when).toBe(
    "2026-11-02",
  );
  expect(todo("Do laundry", "do laundry").when).toBeUndefined();
});

test("a date after deadline words is the deadline, not the start", () => {
  expect(todo("Send the deck", "send the deck by Friday")).toEqual({
    title: "Send the deck",
    list: inbox,
    deadline: "2026-10-30",
  });
  expect(
    todo("Bewerbung abschicken", "bewerbung abschicken bis Donnerstag")
      .deadline,
  ).toBe("2026-10-29");
  expect(
    todo("Fix the bike", "fix the bike tomorrow at 5pm, due next Monday"),
  ).toMatchObject({ when: "2026-10-27@17:00", deadline: "2026-11-02" });
});

test("takes dates out of the title", () => {
  expect(
    todo("Book flights next Tuesday", "book flights next Tuesday").title,
  ).toBe("Book flights");
  expect(todo("Send the deck by Friday", "send the deck by Friday").title).toBe(
    "Send the deck",
  );
});

test("copies spoken checklist, notes and tags word for word", () => {
  const spoken = todo(
    "Write the tweet",
    "write the tweet, checklist record demo, write the hook and schedule it, notes ships in October, tags errands, prio 1, unknown",
    { checklist: ["Made up"], notes: "Made up" },
  );
  expect(spoken).toEqual({
    title: "Write the tweet",
    list: inbox,
    checklist: ["Record demo", "Write the hook", "Schedule it"],
    notes: "Ships in October",
    tags: ["Errands", "Prio 1"],
  });
  expect(
    todo("Renew passport", "renew passport, tags errands", {
      notes: "Tags errands",
    }),
  ).toEqual({ title: "Renew passport", list: inbox, tags: ["Errands"] });
  expect(
    todo("Review the meeting notes", "review the meeting notes tomorrow").notes,
  ).toBeUndefined();
});

test("keeps the model's list only when the dictation names it", () => {
  expect(
    toTodo(
      { title: "Pack", list: "SF trip (packing)" },
      "pack chargers for the SF trip",
      monday,
      { lists: [{ id: "project-1", name: "SF trip (packing)" }], tags: [] },
    ),
  ).toEqual({ title: "Pack", list: "SF trip (packing)", listID: "project-1" });
  expect(
    toTodo(
      { title: "Ask Lisa", list: "Founding startup" },
      "ask Lisa for the invoice",
      monday,
      things,
    ).list,
  ).toBe(inbox);
});

test("builds an add URL and leaves out the inbox and empty fields", () => {
  expect(
    thingsURL(
      {
        title: "Call Milan",
        list: "Thesis",
        listID: "project-1",
        when: "2026-10-27",
        deadline: "2026-10-30",
        tags: ["Uni", "Prio 1"],
        checklist: ["Slides", "Grading"],
        notes: "Mornings",
      },
      false,
    ),
  ).toBe(
    "things:///add?title=Call%20Milan&list-id=project-1&when=2026-10-27&deadline=2026-10-30&tags=Uni%2CPrio%201&checklist-items=Slides%0AGrading&notes=Mornings",
  );
  expect(thingsURL({ title: "Buy milk", list: inbox }, true)).toBe(
    "things:///add?title=Buy%20milk&show-quick-entry=true",
  );
});

test("rejects a list name that several Things lists share", () => {
  const lists = [
    { id: "project-1", name: "Launch" },
    { id: "area-2", name: "Launch" },
  ];
  expect(() =>
    toTodo(
      { title: "Send draft", list: "Launch" },
      "send the launch draft",
      monday,
      { lists, tags: [] },
    ),
  ).toThrow("Several Things lists");
});

test("links the mail or page the to-do came from in the notes", () => {
  const mail = { title: "Invoice March", url: "message://%3Cabc@mail.com%3E" };
  expect(withSource({ title: "Reply", list: inbox }, mail).notes).toBe(
    "Invoice March\nmessage://%3Cabc@mail.com%3E",
  );
  expect(
    withSource(
      { title: "Read", list: inbox, notes: "For the thesis" },
      { title: "Paper", url: "https://arxiv.org/abs/1" },
    ).notes,
  ).toBe("For the thesis\n\nPaper\nhttps://arxiv.org/abs/1");
});

test("ignores links that are not web pages or mails", () => {
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", ""])
    expect(
      withSource({ title: "Read", list: inbox }, { title: "x", url }).notes,
    ).toBeUndefined();
});

test("reads the source only from mail and browsers", () => {
  expect(sourceScript("com.apple.mail")).toContain("messageId");
  expect(sourceScript("com.apple.Safari")).toContain("currentTab");
  expect(sourceScript("com.google.Chrome")).toContain("activeTab");
  expect(sourceScript("com.apple.Notes")).toBeUndefined();
  expect(sourceScript(undefined)).toBeUndefined();
});

test("files a rambling dictation with a self-correction like the user meant it", () => {
  const lists = [
    { id: "area-work", name: "Work" },
    { id: "project-voz", name: "Voz" },
  ];
  expect(
    toTodo(
      {
        title: "Build GTM engineer with Grok bot",
        list: inbox,
        checklist: ["Folder work"],
        notes: "Deadline for tomorrow",
      },
      "Built Gtm Engineer with Crockbot. No, not crockpot, grog? Gro k? Bot Bot Bot Bot. Deadline for tomorrow. Folder work.",
      monday,
      { lists, tags: [] },
    ),
  ).toEqual({
    title: "Build GTM engineer with Grok bot",
    list: "Work",
    listID: "area-work",
    deadline: "2026-10-27",
  });
});

test("reads deadlines with a word between the deadline word and the date", () => {
  expect(todo("Send the deck", "send the deck, deadline is Friday")).toEqual({
    title: "Send the deck",
    list: inbox,
    deadline: "2026-10-30",
  });
  expect(todo("Pay rent", "pay rent, due on Friday").deadline).toBe(
    "2026-10-30",
  );
});

test("files into a project or area the user names with a list word", () => {
  const lists = [{ id: "project-voz", name: "Voz" }];
  for (const dictation of [
    "fix the hotkey bug, project voz",
    "fix the hotkey bug in voz",
    "fix the hotkey bug, ordner voz",
  ])
    expect(
      toTodo({ title: "Fix the hotkey bug", list: inbox }, dictation, monday, {
        lists,
        tags: [],
      }),
    ).toMatchObject({ list: "Voz", listID: "project-voz" });
});

test("drops a generated checklist with a single item", () => {
  expect(
    todo("Book flights", "book flights to Lisbon", {
      checklist: ["Book flights to Lisbon"],
    }).checklist,
  ).toBeUndefined();
  expect(
    todo("Plan the trip", "plan the trip, book flights and find a hotel", {
      checklist: ["Book flights", "Find a hotel"],
    }).checklist,
  ).toEqual(["Book flights", "Find a hotel"]);
});
