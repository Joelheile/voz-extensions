import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { apiVersion, defineExtension, type Context } from "voz";
import {
  calendarRequest,
  confirmation,
  describe,
  edited,
  namedCalendar,
  plan,
  request,
  undoing,
  type Plan,
  type Snapshot,
} from "./calendar";

const script = fileURLToPath(new URL("./eventkit.js", import.meta.url));
const days = 14;
// Voz 0.2.0 and older only run commands whose phrase starts the dictation
const anywhere = apiVersion >= 7;

type Saved = { plan: Plan; id: string };

export default defineExtension((voz) => {
  const settings = voz.settings({
    triggers: {
      type: "string",
      title: "Trigger words",
      description: anywhere
        ? "Say one of these anywhere in a dictation, separated by commas"
        : "Start a dictation with one of these, separated by commas",
      default:
        "calendar, kalender, add to calendar, change calendar, move calendar",
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
    voz.registerCommand({
      phrase: trigger,
      at: anywhere ? "anywhere" : "start",
      run: async (event, ctx) => {
        const dictation = sentence(
          anywhere ? event.text : `${trigger} ${event.text}`,
        );
        try {
          await schedule(ctx, dictation);
        } catch (error) {
          // A command takes the dictation, so keep it when the request fails
          await clipboard(dictation);
          ctx.notify(`${message(error)}. What you said is on the clipboard`);
        }
      },
    });
  }

  async function schedule(ctx: Context, dictation: string) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const [snapshot, asked] = await Promise.all([
      eventKit<Snapshot>("list", { from: from.getTime(), days }),
      ctx.generate(request(dictation)),
    ]);
    if (asked.action === "none") return ctx.insert(dictation);
    const { calendar } =
      asked.action === "add" &&
      snapshot.calendars.length > 1 &&
      !namedCalendar(dictation, snapshot.calendars)
        ? await ctx.generate(calendarRequest(asked.title, snapshot.calendars))
        : { calendar: "none" };
    let next = plan(
      { ...asked, calendar },
      snapshot,
      new Date(),
      settings,
      dictation,
    );
    // Voz 0.2.0 and older have no ctx.ask, so they save without the card
    if (ctx.ask) {
      const answer = await ctx.ask(confirmation(next, snapshot.calendars));
      if (!answer) return;
      if (answer.button === "Copy") {
        await clipboard(dictation);
        return ctx.insert(dictation);
      }
      next = edited(next, answer.values, snapshot.calendars);
    }
    const { id } = await eventKit<{ id: string }>(next.action, next);
    await Bun.write(
      lastChange,
      JSON.stringify({ plan: next, id } satisfies Saved),
    );
    ctx.notify(describe(next));
  }

  voz.registerCommand({
    phrase: "undo calendar",
    at: "start",
    run: (_, ctx) =>
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
  });
});

async function clipboard(text: string) {
  const copy = Bun.spawn(["pbcopy"], { stdin: new Blob([text]) });
  if ((await copy.exited) !== 0) throw new Error("Could not copy the text");
}

function sentence(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function reporting(ctx: Context, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    ctx.notify(message(error));
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
