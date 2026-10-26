import { defineExtension } from "voz";
import { inbox, instructions, schema, thingsURL, toTodo } from "./things";

const listsScript = `const things = Application("Things3");
JSON.stringify({ lists: [...things.projects.name(), ...things.areas.name()], tags: things.tags.name() })`;

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
          schema: schema(lists),
        });
        const todo = toTodo(fields, event.text, new Date(), tags);
        await open(thingsURL(todo, settings.quickEntry));
        ctx.notify(
          todo.list === inbox
            ? `Added "${todo.title}"`
            : `Added "${todo.title}" to ${todo.list}`,
        );
      },
      { at: "start" },
    );
  }
});

async function thingsLists(): Promise<{ lists: string[]; tags: string[] }> {
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
    console.log(`Could not read Things projects: ${error.trim()}`);
    return { lists: [], tags: [] };
  }
  return JSON.parse(output);
}

async function open(url: string) {
  const code = await Bun.spawn(["open", "-g", url]).exited;
  if (code !== 0) throw new Error("Could not open Things. Is it installed?");
}
