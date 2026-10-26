import type { Schema } from "voz";

export type ServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};
export type Config = { mcpServers?: Record<string, ServerConfig> };
export type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};
export type Tool = {
  server: string;
  name: string;
  description?: string;
  inputSchema: JsonSchema;
};
export type Content = { type: string; text?: string };

export const noTool = "None";
export const maxTools = 40;
const extraPaths = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  `${process.env.HOME}/.bun/bin`,
];

export function toolID(tool: Tool) {
  return `${tool.server}/${tool.name}`;
}

export function pickPrompt(text: string, tools: Tool[]) {
  const list = tools
    .map(
      (tool) =>
        `- ${toolID(tool)}: ${(tool.description ?? "").replace(/\s+/g, " ").slice(0, 200)}`,
    )
    .join("\n");
  return `Tools:\n${list}\n\nRequest: ${text}`;
}

export const pickInstructions = `Pick the one tool that does what the user asks, or "${noTool}" if none fits.`;

export function argumentsPrompt(text: string, tool: Tool, now: Date) {
  return `It is ${now.toString()}.\nTool: ${toolID(tool)}: ${tool.description ?? ""}\n\nRequest: ${text}`;
}

export const argumentsInstructions =
  "Fill in the tool's arguments from the request. Leave out arguments the user does not mention.";

const dateWords =
  /\b(today|yesterday|tomorrow|week|month|year|since|ago|last|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+)\b/i;

export function saidArguments(
  args: Record<string, unknown>,
  schema: Schema,
  request: string,
) {
  const required = new Set(schema.type === "object" ? schema.required : []);
  const said = new Set(words(request));
  return Object.fromEntries(
    Object.entries(args).filter(([name, value]) => {
      if (required.has(name)) return true;
      if (typeof value === "number") return said.has(String(value));
      if (typeof value !== "string") return true;
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return dateWords.test(request);
      const valueWords = words(value);
      const shared = valueWords.filter((word) => said.has(word)).length;
      return shared > 0 && shared * 2 >= valueWords.length;
    }),
  );
}

function words(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function toSchema(json: JsonSchema): Schema | undefined {
  const type = Array.isArray(json.type)
    ? json.type.find((candidate) => candidate !== "null")
    : json.type;
  const description = json.description;
  switch (type) {
    case "string": {
      const choices = json.enum?.filter(
        (choice): choice is string => typeof choice === "string",
      );
      return choices?.length
        ? { type, description, enum: choices }
        : { type, description };
    }
    case "number":
    case "integer":
    case "boolean":
      return { type, description };
    case "array": {
      const items = json.items && toSchema(json.items);
      return items && { type, description, items };
    }
    case "object":
    case undefined: {
      if (!json.properties)
        return type
          ? { type: "object", description, properties: {} }
          : undefined;
      const properties = Object.fromEntries(
        Object.entries(json.properties).flatMap(([name, property]) => {
          const schema = toSchema(property);
          return schema ? [[name, schema]] : [];
        }),
      );
      return {
        type: "object",
        description,
        properties,
        required: (json.required ?? []).filter((name) => name in properties),
      };
    }
    default:
      return undefined;
  }
}

export function resultText(content: Content[]) {
  return content
    .flatMap((item) => (item.type === "text" && item.text ? [item.text] : []))
    .join("\n")
    .trim();
}

export function environment(
  base: Record<string, string>,
  server: ServerConfig,
): Record<string, string> {
  const path = [
    ...new Set(
      [...(base.PATH ?? "").split(":"), ...extraPaths].filter(Boolean),
    ),
  ].join(":");
  return { ...base, PATH: path, ...server.env };
}

export function parseConfig(text: string): Record<string, ServerConfig> {
  const config: Config = JSON.parse(text);
  return config.mcpServers ?? {};
}
