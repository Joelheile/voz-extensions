import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";
import { defineExtension } from "voz";
import {
  argumentsInstructions,
  argumentsPrompt,
  environment,
  maxTools,
  noTool,
  parseConfig,
  pickInstructions,
  pickPrompt,
  resultText,
  saidArguments,
  toolID,
  toSchema,
  validateArguments,
  type Content,
  type JsonSchema,
  type Tool,
} from "./mcp";

type Connection = { client: Client; tools: Tool[] };

const historyScript = new URL("./history.ts", import.meta.url).pathname;

export default defineExtension((voz) => {
  const settings = voz.settings({
    trigger: {
      type: "string",
      title: "Trigger word",
      description: "Start a dictation with it to ask your MCP servers",
      default: "agent",
    },
    config: {
      type: "string",
      title: "Servers file",
      description:
        "A JSON file with mcpServers, in the format Claude Desktop uses",
      default: "~/.voz/mcp.json",
    },
    answer: {
      type: "string",
      title: "Show the answer",
      description:
        "Notify shows a short message. Insert types the full answer into the front app",
      default: "notify",
      options: ["notify", "insert"],
    },
  });
  const configPath = settings.config.replace(/^~(?=\/)/, homedir());
  const connections = existsSync(configPath)
    ? connectAll(configPath)
    : Promise.resolve([]);

  voz.registerCommand(
    settings.trigger,
    async (event, ctx) => {
      const ready = await connections;
      const tools = ready
        .flatMap((connection) => connection.tools)
        .slice(0, maxTools);
      if (!tools.length)
        return ctx.notify(`Add MCP servers to ${settings.config}`);
      const { tool: picked } = await ctx.generate({
        instructions: pickInstructions,
        prompt: pickPrompt(event.text, tools),
        schema: {
          type: "object",
          properties: {
            tool: { type: "string", enum: [...tools.map(toolID), noTool] },
          },
          required: ["tool"],
        },
      });
      const tool = tools.find((candidate) => toolID(candidate) === picked);
      if (!tool) return ctx.notify("No tool fits that request");
      const schema = toSchema(tool.inputSchema);
      if (!schema || schema.type !== "object")
        throw new Error(`Unsupported input schema for ${toolID(tool)}`);
      const generated = await ctx.generate({
        instructions: argumentsInstructions,
        prompt: argumentsPrompt(event.text, tool, new Date()),
        schema,
      });
      const args = saidArguments(
        generated as Record<string, unknown>,
        schema,
        event.text,
      );
      validateArguments(tool, args);
      const connection = ready.find((candidate) =>
        candidate.tools.includes(tool),
      )!;
      const result = await connection.client.callTool({
        name: tool.name,
        arguments: args,
      });
      const text = resultText(result.content as Content[]) || "Done";
      if (result.isError)
        return ctx.notify(`${toolID(tool)} failed: ${text.slice(0, 160)}`);
      if (settings.answer === "insert") ctx.insert(text);
      else ctx.notify(text.slice(0, 200));
    },
    { at: "start" },
  );

  voz.registerAction({
    id: "history-config",
    name: "Copy history server config",
    async run(ctx) {
      const config = {
        mcpServers: {
          "voz-history": { command: process.execPath, args: [historyScript] },
        },
      };
      const copy = Bun.spawn(["pbcopy"], {
        stdin: new Blob([JSON.stringify(config, null, 2)]),
      });
      if ((await copy.exited) !== 0) throw new Error("pbcopy failed");
      ctx.notify("Copied. Paste it into your MCP client's config");
    },
  });
});

function connectAll(path: string): Promise<Connection[]> {
  const servers = Object.entries(parseConfig(readFileSync(path, "utf8")));
  return Promise.all(
    servers.map(([name, server]) =>
      connect(name, server).catch((error) => {
        console.log(`MCP server ${name} failed to start: ${error}`);
        return undefined;
      }),
    ),
  ).then((connections) =>
    connections.filter((connection) => connection !== undefined),
  );
}

async function connect(
  name: string,
  server: Parameters<typeof environment>[1],
): Promise<Connection> {
  const client = new Client({ name: "voz", version: "0.1.0" });
  await client.connect(
    new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: environment(getDefaultEnvironment(), server),
      stderr: "ignore",
    }),
  );
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(
      ...page.tools.map((tool) => ({
        server: name,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as JsonSchema,
      })),
    );
    cursor = page.nextCursor;
  } while (cursor);
  return { client, tools };
}
