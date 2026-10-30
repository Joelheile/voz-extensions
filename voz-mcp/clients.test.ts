import { expect, test } from "bun:test";
import {
  connectedMessage,
  pathMarker,
  sameServer,
  serverIn,
  shellPath,
  unconnected,
  withServer,
  type Client,
} from "./clients";

const server = { command: "/bun", args: ["/voz-mcp/history.ts"] };
const client = (
  name: string,
  restart?: boolean,
  current?: typeof server,
): Client => ({
  name,
  restart,
  current: async () => current,
  connect: async () => {},
});

test("adds voz to a Claude Desktop config and keeps everything else", () => {
  const before = JSON.stringify({
    mcpServers: { notes: { command: "notes-mcp" } },
    preferences: { theme: "dark" },
  });
  const after = JSON.parse(withServer(before, server));
  expect(after.mcpServers).toEqual({
    notes: { command: "notes-mcp" },
    voz: server,
  });
  expect(after.preferences).toEqual({ theme: "dark" });
  expect(JSON.parse(withServer("{}", server)).mcpServers.voz).toEqual(server);
});

test("reads the voz entry, and notices when Bun moved", () => {
  expect(serverIn({ voz: server })).toEqual(server);
  expect(serverIn({ voz: { command: "/bun" } })).toEqual({
    command: "/bun",
    args: [],
  });
  expect(serverIn({ other: server })).toBeUndefined();
  expect(serverIn(undefined)).toBeUndefined();
  expect(sameServer(server, { ...server })).toBe(true);
  expect(sameServer(server, { ...server, command: "/new/bun" })).toBe(false);
});

test("connects only the apps without the current server", async () => {
  const apps = [
    client("Claude Code", false, server),
    client("Codex"),
    client("Claude Desktop", true, { ...server, command: "/old/bun" }),
  ];
  const names = (await unconnected(apps, server)).map((app) => app.name);
  expect(names).toEqual(["Codex", "Claude Desktop"]);
});

test("names every connected app and asks to restart only the ones that need it", () => {
  expect(
    connectedMessage(
      [client("Claude Code"), client("Codex"), client("Claude Desktop", true)],
      [],
    ),
  ).toBe(
    "Connected Voz to Claude Code, Codex and Claude Desktop. Restart Claude Desktop to use it",
  );
  expect(
    connectedMessage([client("Codex")], ["Claude Code failed: no auth"]),
  ).toBe("Connected Voz to Codex. Claude Code failed: no auth");
});

test("reads the PATH out of shell output with startup noise around it", () => {
  expect(shellPath(`motd\n${pathMarker}/a:/b${pathMarker}`)).toBe("/a:/b");
  expect(() => shellPath("no marker")).toThrow("shell PATH");
});
