import { mkdir, rm } from "node:fs/promises";
import { defineExtension, type Context } from "voz";
import {
  describe,
  instructions,
  plan,
  schema,
  undoing,
  type Plan,
  type Snapshot,
} from "./calendar";

const script = new URL("./eventkit.js", import.meta.url).pathname;
const days = 14;

type Saved = { plan: Plan; id: string };

export default defineExtension((voz) => {
  const settings = voz.settings({
    triggers: {
      type: "string",
      title: "Trigger words",
      description: "Start a dictation with one of these, separated by commas",
      default: "calendar, add to calendar, change calendar, move calendar",
    },
    calendar: {
      type: "string",
      title: "Default calendar",
      description:
        "Where new events go when you don't name a calendar. Empty uses Calendar's default",
      default: "",
    },
    minutes: {
      type: "number",
      title: "Default length in minutes",
      default: 60,
    },
    dayStart: {
      type: "number",
      title: "Workday starts at",
      description: "Hour, 0 to 23. Free time is found inside your workday",
      default: 9,
    },
    dayEnd: {
      type: "number",
      title: "Workday ends at",
      description: "Hour, 0 to 23",
      default: 18,
    },
  });
  const lastChange = `${voz.paths.data}/last-change.json`;

  for (const trigger of settings.triggers
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean)) {
    voz.registerCommand(
      trigger,
      (event, ctx) =>
        reporting(ctx, async () => {
          if (!event.text)
            return ctx.notify(
              "Say what to add or change after the trigger word",
            );
          const dictation = `${trigger} ${event.text}`;
          const from = new Date();
          from.setHours(0, 0, 0, 0);
          const [snapshot, request] = await Promise.all([
            eventKit<Snapshot>("list", { from: from.getTime(), days }),
            ctx.generate({
              instructions,
              prompt: `Dictation: ${dictation}`,
              schema,
            }),
          ]);
          const next = plan(request, snapshot, new Date(), settings, dictation);
          const { id } = await eventKit<{ id: string }>(next.action, next);
          await mkdir(voz.paths.data, { recursive: true });
          await Bun.write(
            lastChange,
            JSON.stringify({ plan: next, id } satisfies Saved),
          );
          ctx.notify(describe(next));
        }),
      { at: "start" },
    );
  }

  voz.registerCommand(
    "undo calendar",
    (_, ctx) =>
      reporting(ctx, async () => {
        const file = Bun.file(lastChange);
        if (!(await file.exists()))
          return ctx.notify("No calendar change to undo");
        const saved: Saved = await file.json();
        const { command, input, message } = undoing(saved.plan, saved.id);
        await eventKit(command, input);
        await rm(lastChange);
        ctx.notify(message);
      }),
    { at: "start" },
  );
});

async function reporting(ctx: Context, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    ctx.notify(error instanceof Error ? error.message : String(error));
  }
}

async function eventKit<Result>(
  command: "list" | "add" | "update" | "remove",
  input: object,
): Promise<Result> {
  const process = Bun.spawn(
    ["osascript", "-l", "JavaScript", script, command, JSON.stringify(input)],
    { stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code !== 0)
    throw new Error(`Calendar ${command} failed: ${error.trim()}`);
  return JSON.parse(output);
}
