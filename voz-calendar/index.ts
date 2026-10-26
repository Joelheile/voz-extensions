import { defineExtension } from "voz";
import {
  describe,
  instructions,
  plan,
  schema,
  type Snapshot,
} from "./calendar";

const script = new URL("./eventkit.js", import.meta.url).pathname;
const days = 7;

export default defineExtension((voz) => {
  const settings = voz.settings({
    triggers: {
      type: "string",
      title: "Trigger words",
      description: "Start a dictation with one of these, separated by commas",
      default: "calendar",
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
  });

  for (const trigger of settings.triggers
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean)) {
    voz.registerCommand(
      trigger,
      async (event, ctx) => {
        if (!event.text)
          return ctx.notify("Say what to add or move after the trigger word");
        const snapshot = await eventKit<Snapshot>("list", { days });
        const request = await ctx.generate({
          instructions,
          prompt: `Dictation: ${event.text}`,
          schema,
        });
        const next = plan(request, snapshot, new Date(), settings, event.text);
        if (next.action === "add") await eventKit("add", next);
        else await eventKit("move", next);
        ctx.notify(describe(next));
      },
      { at: "start" },
    );
  }
});

async function eventKit<Result>(
  command: "list" | "add" | "move",
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
