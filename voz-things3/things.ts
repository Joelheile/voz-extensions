import * as chrono from "chrono-node";

type Fields = {
  title: string;
  list: string;
  checklist?: string[];
  notes?: string;
};

type Todo = Fields & {
  listID?: string;
  when?: string;
  deadline?: string;
  tags?: string[];
};

export const inbox = "Inbox";

export type ThingsList = { id: string; name: string };

export type Source = { title: string; url: string };

const chromiumBrowsers = new Set([
  "com.google.Chrome",
  "company.thebrowser.Browser",
  "company.thebrowser.dia",
  "com.brave.Browser",
  "com.microsoft.edgemac",
  "com.vivaldi.Vivaldi",
]);

const thingsWhen = new Map([
  ["tonight", "evening"],
  ["this evening", "evening"],
  ["heute abend", "evening"],
  ["anytime", "anytime"],
  ["someday", "someday"],
  ["sometime", "someday"],
  ["irgendwann", "someday"],
]);
const deadlineWord = "(?:deadline|due|by|until|bis|spätestens|fällig)";
const deadlineLead = `\\b${deadlineWord}(?:\\s+(?:is|for|on|at|ist|am|zum))?\\s+`;
const endsWithDeadlineLead = new RegExp(`${deadlineLead}$`, "i");
const listWord =
  "(?:folder|project|area|list|in|into|ordner|projekt|bereich|liste|im)";
const fillerWords = new RegExp(
  `\\b(?:${deadlineWord}|${listWord}|is|for|on|at|the|my)\\b`,
  "gi",
);
const sectionWord = /(?:^|[,.;:]\s*)\b(checklist|notes?|tags?)\b[\s,;:]*/gi;

export const instructions = `You turn a dictated to-do into fields for the Things app. People dictate loosely: they ramble, repeat words and correct themselves. Work out what they mean from everything they said.
- title: one short action that starts with a verb, at most 8 words, such as "Email Anna the contract". Fix the verb form, so "built" becomes "Build". When the user corrects a word, such as "no, not X, Y", use the corrected word. Leave out filler, repeats, dates, deadlines and list names. Keep the user's language
- list: the listed project or area the user names, such as "folder work" or "in Voz", else "${inbox}"
- notes: only details needed to do the task that do not fit the title, such as who, why or what to bring. Most to-dos have no notes. Never put dates, deadlines, list names or corrections in notes
- checklist: only when the user lists two or more separate steps. Most to-dos have no checklist
Leave out fields you have nothing for.

Example: "call Milan tomorrow"
{"title": "Call Milan", "list": "${inbox}"}

Example: "built the landing page with crockbot, no, not crockpot, grok bot. deadline for tomorrow. folder work"
{"title": "Build the landing page with Grok bot", "list": "Work"}

Example: "prepare the pitch deck for the startup by Friday, I need a market slide, a team slide and send it to Anna"
{"title": "Prepare the pitch deck", "list": "Founding startup", "checklist": ["Market slide", "Team slide", "Send it to Anna"]}

Example: "rechnung an Lisa schicken, sie braucht die Steuernummer"
{"title": "Rechnung an Lisa schicken", "list": "${inbox}", "notes": "Sie braucht die Steuernummer"}`;

export function schema(lists: ThingsList[]) {
  return {
    type: "object",
    properties: {
      title: { type: "string", description: "Short imperative title" },
      list: {
        type: "string",
        enum: [inbox, ...new Set(lists.map((list) => list.name))],
      },
      checklist: { type: "array", items: { type: "string" } },
      notes: { type: "string" },
    },
    required: ["title", "list"],
  } as const;
}

export function toTodo(
  fields: Fields,
  dictation: string,
  now: Date,
  things: { lists: ThingsList[]; tags: string[] },
): Todo {
  const spoken = sections(dictation);
  const dates = spokenDates(spoken.main, now);
  const title = dates.phrases.reduce(
    (title, phrase) =>
      title.replace(
        new RegExp(`\\s*(${deadlineLead})?${RegExp.escape(phrase)}`, "i"),
        "",
      ),
    fields.title,
  );
  const spokeSections = spoken.checklist || spoken.notes || spoken.tags;
  const list =
    namedList(spoken.main, things.lists) ??
    (says(dictation, fields.list) ? fields.list : inbox);
  const saysOnlyWhereOrWhen = (text: string) =>
    !words(withoutPhrases(text, [...dates.phrases, list])).length;
  const checklist = fields.checklist?.filter(
    (item) => item !== fields.title && !saysOnlyWhereOrWhen(item),
  );
  const todo: Todo = {
    title: title.replace(/[\s,;:]+$/, ""),
    list,
    listID: listID(list, things.lists),
    checklist: spokeSections
      ? spoken.checklist
      : checklist && checklist.length > 1
        ? checklist
        : undefined,
    notes: spokeSections
      ? spoken.notes
      : fields.notes && !saysOnlyWhereOrWhen(fields.notes)
        ? fields.notes
        : undefined,
    when: dates.when,
    deadline: dates.deadline,
    tags: spoken.tags?.flatMap((said) =>
      things.tags.filter((tag) => tag.toLowerCase() === said.toLowerCase()),
    ),
  };
  return Object.fromEntries(
    Object.entries(todo).filter(([, value]) => value?.length),
  ) as Todo;
}

function namedList(text: string, lists: ThingsList[]) {
  return lists.find((list) =>
    new RegExp(
      `\\b${listWord}\\s+(?:the\\s+|my\\s+)?${RegExp.escape(list.name)}\\b`,
      "i",
    ).test(text),
  )?.name;
}

function withoutPhrases(text: string, phrases: string[]) {
  return phrases
    .reduce(
      (rest, phrase) =>
        rest.replace(new RegExp(RegExp.escape(phrase), "gi"), ""),
      text,
    )
    .replace(fillerWords, "");
}

function listID(name: string, lists: ThingsList[]) {
  if (name === inbox) return undefined;
  const matches = lists.filter((list) => list.name === name);
  if (matches.length > 1)
    throw new Error(
      `Several Things lists are named "${name}". Rename one to dictate to it.`,
    );
  return matches[0]?.id;
}

export function sourceScript(bundleID?: string) {
  if (bundleID === "com.apple.mail")
    return `const message = Application("com.apple.mail").selection()[0];
JSON.stringify(message ? { title: message.subject(), url: "message://" + encodeURIComponent("<" + message.messageId() + ">") } : null)`;
  if (bundleID === "com.apple.Safari")
    return `const tab = Application("com.apple.Safari").windows[0].currentTab();
JSON.stringify({ title: tab.name(), url: tab.url() })`;
  if (bundleID && chromiumBrowsers.has(bundleID))
    return `const tab = Application("${bundleID}").windows[0].activeTab();
JSON.stringify({ title: tab.title(), url: tab.url() })`;
  return undefined;
}

export function withSource(todo: Todo, source?: Source | null): Todo {
  if (!source || !/^(https?|message):\/\//.test(source.url)) return todo;
  const link = [source.title.trim(), source.url].filter(Boolean).join("\n");
  return { ...todo, notes: [todo.notes, link].filter(Boolean).join("\n\n") };
}

export function thingsURL(todo: Todo, quickEntry: boolean) {
  const params: [string, string | undefined][] = [
    ["title", todo.title],
    ["list-id", todo.listID],
    ["when", todo.when],
    ["deadline", todo.deadline],
    ["tags", todo.tags?.join(",")],
    ["checklist-items", todo.checklist?.join("\n")],
    ["notes", todo.notes],
    ["show-quick-entry", quickEntry ? "true" : undefined],
  ];
  const query = params
    .filter((param): param is [string, string] => Boolean(param[1]?.trim()))
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim())}`)
    .join("&");
  return `things:///add?${query}`;
}

function spokenDates(text: string, now: Date) {
  const phrases: string[] = [];
  let when: string | undefined;
  let deadline: string | undefined;
  for (const [phrase, keyword] of thingsWhen)
    if (new RegExp(`\\b${phrase}\\b`, "i").test(text)) {
      when ??= keyword;
      phrases.push(phrase);
    }
  for (const result of parse(text, now)) {
    phrases.push(result.text);
    const date = result.start.date();
    if (endsWithDeadlineLead.test(text.slice(0, result.index)))
      deadline ??= isoDate(date);
    else
      when ??= result.start.isCertain("hour")
        ? `${isoDate(date)}@${time(date)}`
        : isoDate(date);
  }
  return { when, deadline, phrases };
}

function parse(text: string, now: Date) {
  for (const parser of [chrono, chrono.de]) {
    const results = parser
      .parse(text, now, { forwardDate: true })
      .filter((result) => result.text.length > 2);
    if (results.length) return results;
  }
  return [];
}

function sections(dictation: string) {
  const markers = [...dictation.matchAll(sectionWord)];
  const part = (name: string) => {
    const index = markers.findIndex((marker) =>
      marker[1]!.toLowerCase().startsWith(name),
    );
    if (index < 0) return undefined;
    const marker = markers[index]!;
    return dictation
      .slice(marker.index + marker[0].length, markers[index + 1]?.index)
      .replace(/[\s,;:.]+$/, "");
  };
  const items = (text?: string) =>
    text
      ?.split(/\s*(?:,|;|\band\b)\s*/i)
      .filter(Boolean)
      .map(capitalize);
  const notes = part("note");
  return {
    main: dictation.slice(0, markers[0]?.index),
    checklist: items(part("checklist")),
    notes: notes && capitalize(notes),
    tags: items(part("tag")),
  };
}

function says(dictation: string, name: string) {
  const said = new Set(words(dictation));
  return words(name).some((word) => word.length > 2 && said.has(word));
}

function words(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function capitalize(text: string) {
  return text[0]!.toUpperCase() + text.slice(1);
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function time(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
