import { defineExtension } from "voz";
import {
  instructions,
  resolveList,
  schema,
  thingsURL,
  toTodo,
  type ThingsList,
} from "./things";

const listsScript = `const things = Application("Things3");
JSON.stringify({ lists: [...things.projects().filter(project => project.status() === "open"), ...things.areas()].map(list => ({ id: list.id(), name: list.name() })), tags: things.tags.name() })`;

export default defineExtension((voz) => {
  const settings = voz.settings({
    triggers: {
      type: "string",
      title: "Trigger words",
      description: "Start a dictation with one of these, separated by commas",
      default: "todo, to do",
    },
    quickEntry: {
      type: "boolean",
      title: "Review in Quick Entry",
      description:
        "Open the to-do in Things Quick Entry instead of adding it right away",
      default: false,
    },
  });

  for (const trigger of settings.triggers
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean)) {
    voz.registerCommand(
      trigger,
      async (event, ctx) => {
        if (!event.text)
          return ctx.notify("Say the to-do after the trigger word");
        const { lists, tags } = await thingsLists();
        const fields = await ctx.generate({
          instructions,
          prompt: `Dictation: ${event.text}`,
          schema: schema([...new Set(lists.map((list) => list.name))]),
        });
        const todo = resolveList(
          toTodo(fields, event.text, new Date(), tags),
          lists,
        );
        if (!todo.title.trim())
          throw new Error("The to-do title is empty. Say what you want to do.");
        await open(thingsURL(todo, settings.quickEntry));
        ctx.notify(
          settings.quickEntry
            ? `Opened "${todo.title}" for review in Things`
            : `Sent "${todo.title}" to Things`,
        );
      },
      { at: "start" },
    );
  }
});

async function thingsLists(): Promise<{ lists: ThingsList[]; tags: string[] }> {
  const process = Bun.spawn(
    ["osascript", "-l", "JavaScript", "-e", listsScript],
    { stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `Could not read Things projects (exit ${code}): ${error.trim()}. Check that Things is installed and allow Voz to control it in System Settings > Privacy & Security > Automation.`,
    );
  }
  return JSON.parse(output);
}

async function open(url: string) {
  const code = await Bun.spawn(["open", "-g", url]).exited;
  if (code !== 0) throw new Error("Could not open Things. Is it installed?");
}
