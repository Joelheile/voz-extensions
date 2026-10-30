import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { defineExtension } from "voz";
import { markdown, transcriptPath } from "./transcript";

export default defineExtension((voz) => {
  voz.on("audioDrop", async ({ path }, ctx) => {
    const transcript = await ctx.transcribe(path, { speakers: true });
    if (!transcript.text.trim()) {
      ctx.notify(`No speech found in ${basename(path)}`);
      throw new Error(`No speech found in ${path}`);
    }
    const text = markdown(transcript);
    const output = transcriptPath(path);
    writeFileSync(output, text, { flag: "wx" });
    await copy(text);
    const speakers =
      transcript.speakers > 1 ? ` with ${transcript.speakers} speakers` : "";
    ctx.notify(`Saved ${basename(output)}${speakers} and copied it`);
  });
});

// Voz starts without a locale, and pbcopy then reads UTF-8 as Mac Roman: ö becomes √∂
async function copy(text: string) {
  const pbcopy = Bun.spawn(["pbcopy"], {
    stdin: new Blob([text]),
    env: { ...process.env, LANG: "en_US.UTF-8" },
  });
  if ((await pbcopy.exited) !== 0) throw new Error("pbcopy failed");
}
