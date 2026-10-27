import * as chrono from "chrono-node";

export type Fields = {
  title: string;
  list: string;
  checklist?: string[];
  notes?: string;
};

export type Todo = Fields & {
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
const deadlineWord = "(?:deadline|due|by|until|bis|spätestens)";
const endsWithDeadlineWord = new RegExp(`\\b${deadlineWord}\\s+$`, "i");
const sectionWord = /(?:^|[,.;:]\s*)\b(checklist|notes?|tags?)\b[\s,;:]*/gi;

export const instructions = `You turn a dictated to-do into fields for the Things app.
- title: what to do, as a short imperative phrase. Leave out dates. Keep the user's language
- list: the listed project or area the dictation names, else "${inbox}"
- checklist: only the steps the user lists. Never repeat the title
- notes: only context the user adds that is not a step
Leave out fields the user does not mention.

Example: "call Milan tomorrow"
{"title": "Call Milan", "list": "${inbox}"}

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
        new RegExp(
          `\\s*(\\b${deadlineWord}\\s+)?${RegExp.escape(phrase)}`,
          "i",
        ),
        "",
      ),
    fields.title,
  );
  const spokeSections = spoken.checklist || spoken.notes || spoken.tags;
  const todo: Todo = {
    title: title.replace(/[\s,;:]+$/, ""),
    list: says(dictation, fields.list) ? fields.list : inbox,
    listID: listID(fields.list, dictation, things.lists),
    checklist: spokeSections
      ? spoken.checklist
      : fields.checklist?.filter((item) => item !== fields.title),
    notes: spokeSections ? spoken.notes : fields.notes,
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

function listID(name: string, dictation: string, lists: ThingsList[]) {
  if (name === inbox || !says(dictation, name)) return undefined;
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
    if (endsWithDeadlineWord.test(text.slice(0, result.index)))
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
