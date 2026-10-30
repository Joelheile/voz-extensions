import { existsSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { Transcript } from "voz";

export function markdown(transcript: Transcript) {
  if (transcript.speakers < 2) return `${transcript.text.trim()}\n`;
  const turns = transcript.turns.map(
    (turn) =>
      `**[${timestamp(turn.start)}] Speaker ${turn.speaker}:** ${turn.text}`,
  );
  return `${turns.join("\n\n")}\n`;
}

export function timestamp(seconds: number) {
  const whole = Math.floor(seconds);
  const parts = [whole / 3600, (whole % 3600) / 60, whole % 60];
  return parts
    .map((part) => String(Math.floor(part)).padStart(2, "0"))
    .join(":");
}

export function transcriptPath(
  audio: string,
  exists: (path: string) => boolean = existsSync,
) {
  const name = join(dirname(audio), basename(audio, extname(audio)));
  let path = `${name}.md`;
  for (let copy = 2; exists(path); copy++) path = `${name} ${copy}.md`;
  return path;
}
