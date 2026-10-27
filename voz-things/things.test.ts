import { expect, test } from "bun:test";
import { inbox, resolveList, thingsURL, toTodo } from "./things";

const monday = new Date(2026, 9, 26, 10, 0);
const tags = ["Errands", "Prio 1"];
const todo = (title: string, dictation: string, extra = {}) =>
  toTodo({ title, list: inbox, ...extra }, dictation, monday, tags);

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
      [],
    ).list,
  ).toBe("SF trip (packing)");
  expect(
    toTodo(
      { title: "Ask Lisa", list: "Founding startup" },
      "ask Lisa for the invoice",
      monday,
      [],
    ).list,
  ).toBe(inbox);
});

test("builds an add URL and leaves out the inbox and empty fields", () => {
  expect(
    thingsURL(
      {
        title: "Call Milan",
        list: "Thesis",
        when: "2026-10-27",
        deadline: "2026-10-30",
        tags: ["Uni", "Prio 1"],
        checklist: ["Slides", "Grading"],
        notes: "Mornings",
      },
      false,
    ),
  ).toBe(
    "things:///add?title=Call%20Milan&list=Thesis&when=2026-10-27&deadline=2026-10-30&tags=Uni%2CPrio%201&checklist-items=Slides%0AGrading&notes=Mornings",
  );
  expect(thingsURL({ title: "Buy milk", list: inbox }, true)).toBe(
    "things:///add?title=Buy%20milk&show-quick-entry=true",
  );
});

test("uses a stable Things ID and rejects ambiguous or missing destinations", () => {
  const destination = { title: "Send draft", list: "Launch" };
  const resolved = resolveList(destination, [
    { id: "project-1", name: "Launch" },
  ]);
  expect(thingsURL(resolved, false)).toBe(
    "things:///add?title=Send%20draft&list-id=project-1",
  );
  expect(() =>
    resolveList(destination, [
      { id: "project-1", name: "Launch" },
      { id: "area-2", name: "Launch" },
    ]),
  ).toThrow("Several Things lists");
  expect(() => resolveList(destination, [])).toThrow("not found");
  expect(resolveList({ title: "Buy milk", list: inbox }, [])).toEqual({
    title: "Buy milk",
    list: inbox,
  });
});
