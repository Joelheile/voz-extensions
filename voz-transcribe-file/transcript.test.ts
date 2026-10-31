import { expect, test } from "bun:test";
import { markdown, transcriptPath } from "./transcript";

const turns = [
  { speaker: 1, start: 0, end: 4, text: "Did you finish the report?" },
  { speaker: 2, start: 4.7, end: 10, text: "Almost." },
  { speaker: 1, start: 3725.2, end: 3730, text: "Great." },
];

test("several speakers become timestamped turns", () => {
  expect(markdown({ text: "", seconds: 3730, speakers: 2, turns })).toBe(
    "**[00:00:00] Speaker 1:** Did you finish the report?\n\n" +
      "**[00:00:04] Speaker 2:** Almost.\n\n" +
      "**[01:02:05] Speaker 1:** Great.\n",
  );
});

test("one speaker stays plain text", () => {
  expect(
    markdown({
      text: " Just me talking. ",
      seconds: 3,
      speakers: 1,
      turns: [turns[0]],
    }),
  ).toBe("Just me talking.\n");
});

test("the transcript sits next to the audio and never overwrites", () => {
  const taken = new Set(["/calls/standup.md", "/calls/standup 2.md"]);
  expect(
    transcriptPath("/calls/interview.mp3", (path) => taken.has(path)),
  ).toBe("/calls/interview.md");
  expect(transcriptPath("/calls/standup.m4a", (path) => taken.has(path))).toBe(
    "/calls/standup 3.md",
  );
});
