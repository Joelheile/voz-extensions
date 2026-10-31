import { accessSync, constants, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { defineExtension } from "voz";
import { markdown, transcriptPath } from "./transcript";

export default defineExtension((voz) => {
  voz.on("audioDrop", async ({ path }, ctx) => {
    if (!writable(dirname(path))) {
      ctx.notify(
        `Can't save a transcript next to ${basename(path)}. Its folder is read-only`,
      );
      throw new Error(`Read-only folder: ${dirname(path)}`);
    }
    const transcript = await ctx.transcribe(path, { speakers: true });
    if (!transcript.text.trim()) {
      ctx.notify(`No speech found in ${basename(path)}`);
      throw new Error(`No speech found in ${path}`);
    }
    const text = markdown(transcript);
    const output = transcriptPath(path);
    writeFileSync(output, text, { flag: "wx" });
    voz.addHistory({ text, seconds: transcript.seconds, file: output });
    const copied = await copy(text);
    const speakers =
      transcript.speakers > 1 ? ` with ${transcript.speakers} speakers` : "";
    ctx.notify(
      `Saved ${basename(output)}${speakers}${copied ? " and copied it" : ""}`,
    );
  });
});

function writable(folder: string) {
  try {
    accessSync(folder, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// Voz starts without a locale, and pbcopy then reads UTF-8 as Mac Roman: ö becomes √∂
async function copy(text: string) {
  const pbcopy = Bun.spawn(["pbcopy"], {
    stdin: new Blob([text]),
    env: { ...process.env, LANG: "en_US.UTF-8" },
  });
  return (await pbcopy.exited) === 0;
}
