import { defineExtension } from "voz";
import {
  instructions,
  schema,
  sourceScript,
  thingsURL,
  toTodo,
  withSource,
  type Source,
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
      default: "add todo, add a todo, add to do, new todo",
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
    voz.registerCommand({
      phrase: trigger,
      at: "start",
      async run(event, ctx) {
        if (!event.text)
          return ctx.notify("Say the to-do after the trigger word");
        const [things, source] = await Promise.all([
          thingsLists(),
          frontSource(ctx.app.bundleID),
        ]);
        const fields = await ctx.generate({
          instructions,
          prompt: `Dictation: ${event.text}`,
          schema: schema(things.lists),
        });
        const todo = withSource(
          toTodo(fields, event.text, new Date(), things),
          source === unreadable ? undefined : source,
        );
        if (!todo.title) return ctx.notify("Say what you want to do");
        await open(thingsURL(todo, settings.quickEntry));
        const sent = settings.quickEntry
          ? `Opened "${todo.title}" for review in Things`
          : `Sent "${todo.title}" to Things`;
        ctx.notify(
          source === unreadable
            ? `${sent} without a link. Allow Voz to control ${ctx.app.name ?? "that app"} in System Settings > Privacy & Security > Automation`
            : sent,
        );
      },
    });
  }
});

const unreadable: "unreadable" = "unreadable";
const notAuthorized = "-1743";

async function thingsLists(): Promise<{ lists: ThingsList[]; tags: string[] }> {
  try {
    return await jxa(listsScript);
  } catch (error) {
    throw new Error(
      `Could not read Things projects: ${(error as Error).message}. Check that Things is installed and allow Voz to control it in System Settings > Privacy & Security > Automation.`,
    );
  }
}

async function frontSource(
  bundleID?: string,
): Promise<Source | typeof unreadable | undefined> {
  const script = sourceScript(bundleID);
  if (!script) return undefined;
  try {
    return await jxa(script, 2000);
  } catch (error) {
    return (error as Error).message.includes(notAuthorized)
      ? unreadable
      : undefined;
  }
}

async function jxa(script: string, timeout?: number) {
  const process = Bun.spawn(["osascript", "-l", "JavaScript", "-e", script], {
    stderr: "pipe",
    timeout,
  });
  const [output, error, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code !== 0) throw new Error(`exit ${code}: ${error.trim()}`);
  return JSON.parse(output);
}

async function open(url: string) {
  const code = await Bun.spawn(["open", "-g", url]).exited;
  if (code !== 0) throw new Error("Could not open Things. Is it installed?");
}
