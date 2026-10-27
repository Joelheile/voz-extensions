import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
  environment,
  resultText,
  saidArguments,
  toSchema,
  validateArguments,
  type Content,
  type JsonSchema,
} from "./mcp";

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

const call = async (args: Record<string, string | number>) =>
  resultText(
    (await client.callTool({ name: "search_dictations", arguments: args }))
      .content as Content[],
  );

test("validates generated arguments against the server's original constraints", () => {
  const tool = {
    server: "test",
    name: "search",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 10 } },
      required: ["limit"],
      additionalProperties: false,
    },
  };
  expect(() => validateArguments(tool, { limit: 5 })).not.toThrow();
  expect(() => validateArguments(tool, { limit: 100 })).toThrow(
    "Invalid arguments for test/search",
  );
  expect(() => validateArguments(tool, {})).toThrow("Invalid arguments");
});

test("history server searches dictations newest first, by words and app", async () => {
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

test("history tool schema converts to a schema the on-device model accepts", async () => {
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name)).toEqual(["search_dictations"]);
  const schema = toSchema(tools[0].inputSchema as JsonSchema);
  expect(schema?.type).toBe("object");
  expect(schema?.type === "object" && Object.keys(schema.properties)).toEqual([
    "query",
    "app",
    "since",
    "limit",
  ]);
});

test("unsupported schema parts are dropped and nullable types kept", () => {
  const schema = toSchema({
    type: "object",
    properties: {
      title: { type: ["string", "null"], description: "Title" },
      mode: { type: "string", enum: ["a", "b", 3] },
      tags: { type: "array", items: { type: "string" } },
      blob: { anyOf: [{ type: "string" }] } as JsonSchema,
    },
    required: ["title", "blob"],
  });
  expect(schema).toEqual({
    type: "object",
    description: undefined,
    properties: {
      title: { type: "string", description: "Title" },
      mode: { type: "string", description: undefined, enum: ["a", "b"] },
      tags: {
        type: "array",
        description: undefined,
        items: { type: "string", description: undefined },
      },
    },
    required: ["title"],
  });
});

test("servers find npx and bun even when Voz starts without a shell PATH", () => {
  const env = environment(
    { PATH: "/usr/bin:/bin" },
    { command: "npx", env: { TOKEN: "x" } },
  );
  expect(env.PATH.split(":")).toContain("/opt/homebrew/bin");
  expect(env.TOKEN).toBe("x");
});

test("keeps required arguments and only the optional ones the request says", () => {
  const schema = toSchema({
    type: "object",
    properties: {
      repo: { type: "string" },
      title: { type: "string" },
      body: { type: "string" },
      since: { type: "string" },
      limit: { type: "integer" },
      app: { type: "string" },
    },
    required: ["repo"],
  })!;
  expect(
    saidArguments(
      {
        repo: "x/y",
        title: "hotkey breaks after sleep",
        body: "The hotkey stops working after a long period of inactivity on the laptop",
        since: "2026-10-26",
        limit: 1,
        app: "Voz",
      },
      schema,
      "issue in x/y titled hotkey breaks after sleep today",
    ),
  ).toEqual({
    repo: "x/y",
    title: "hotkey breaks after sleep",
    since: "2026-10-26",
  });
  expect(
    saidArguments(
      { limit: 5, since: "2026-10-26" },
      schema,
      "my last 5 dictations",
    ),
  ).toEqual({ limit: 5, since: "2026-10-26" });
});
