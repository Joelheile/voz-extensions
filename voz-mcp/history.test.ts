import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const path = join(mkdtempSync(join(tmpdir(), "voz-mcp-")), "history.sqlite");
const database = new Database(path);
database.run(
  "CREATE TABLE transcript (createdAt TEXT, appName TEXT, finalText TEXT)",
);
database.run(`INSERT INTO transcript VALUES
  ('2026-10-20 09:00:00.000', 'Mail', 'Send the invoice to Milan'),
  ('2026-10-25 18:30:00.000', 'Slack', 'Lunch on Thursday?'),
  ('2026-10-26 08:00:00.000', 'Slack', 'The invoice is paid')`);
database.close();
const client = new Client({ name: "test", version: "0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [join(import.meta.dir, "history.ts"), path],
    stderr: "ignore",
  }),
);
afterAll(() => client.close());

const call = async (args: Record<string, string | number>) => {
  const result = await client.callTool({
    name: "search_dictations",
    arguments: args,
  });
  return (result.content as { text: string }[])[0]!.text;
};

test("serves as voz with one read-only search tool", async () => {
  expect(client.getServerVersion()?.name).toBe("voz");
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name)).toEqual(["search_dictations"]);
  expect(tools[0]!.annotations?.readOnlyHint).toBe(true);
});

test("searches dictations newest first, by words, app and date", async () => {
  expect(await call({ query: "INVOICE" })).toMatch(
    /The invoice is paid[\s\S]*Send the invoice to Milan/,
  );
  expect(await call({ app: "Slack", limit: 1 })).toContain(
    "The invoice is paid",
  );
  expect(await call({ app: "Slack", limit: 1 })).not.toContain("Lunch");
  expect(await call({ since: "2026-10-21", query: "invoice" })).not.toContain(
    "Milan",
  );
  expect(await call({ query: "nothing like this" })).toStartWith(
    "No dictations match",
  );
  expect(await call({ query: "slack", app: "Slack" })).toContain("Lunch");
});
