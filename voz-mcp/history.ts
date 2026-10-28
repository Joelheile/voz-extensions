// A read-only MCP server for your Voz dictation history.
// Run it with Bun: bun history.ts. The "Copy history server config" action in Voz gives you the exact command.
import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

type Dictation = { createdAt: string; app: string | null; text: string };
type Search = {
  query?: string;
  app?: string;
  since?: string;
  limit: number;
};

const defaultPath = join(
  homedir(),
  "Library/Application Support/voz/history.sqlite",
);

export function search(
  database: Database,
  { query, app, since, limit }: Search,
): Dictation[] {
  return database
    .query<Dictation, Record<string, string | number | null>>(
      `SELECT createdAt, appName AS app, finalText AS text FROM transcript
       WHERE ($query IS NULL OR finalText LIKE '%' || $query || '%' OR appName LIKE $query)
         AND ($app IS NULL OR appName LIKE $app)
         AND ($since IS NULL OR createdAt >= $since)
       ORDER BY createdAt DESC LIMIT $limit`,
    )
    .all({
      $query: query ?? null,
      $app: app ?? null,
      $since: since ?? null,
      $limit: limit,
    })
    .map((row) => ({ ...row, createdAt: localTime(row.createdAt) }));
}

export function format(dictations: Dictation[]) {
  if (!dictations.length)
    return "No dictations match. Try fewer words or drop the filters.";
  return dictations
    .map(
      ({ createdAt, app, text }) =>
        `${createdAt} · ${app ?? "Unknown app"}\n${text}`,
    )
    .join("\n\n");
}

function localTime(utc: string) {
  const date = new Date(`${utc.replace(" ", "T")}Z`);
  return `${date.toLocaleDateString("sv-SE")} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function server(database: Database) {
  const server = new McpServer({ name: "voz", version: "0.1.0" });
  server.registerTool(
    "search_dictations",
    {
      description:
        "Search what the user dictated with Voz, newest first. Each result has the local time, the app it was dictated into and the text. Leave out query to get the latest dictations.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe(
            'Words in the dictated text or the app name, such as "invoice"',
          ),
        app: z
          .string()
          .optional()
          .describe('App name, such as "Slack" or "Mail"'),
        since: z
          .string()
          .optional()
          .describe("Only dictations on or after this UTC date, as YYYY-MM-DD"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("How many to return"),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => ({
      content: [{ type: "text", text: format(search(database, input)) }],
    }),
  );
  return server;
}

if (import.meta.main) {
  const database = new Database(process.argv[2] ?? defaultPath, {
    readonly: true,
  });
  serveStdio(() => server(database));
}
