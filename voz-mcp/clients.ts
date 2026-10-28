import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type Server = { command: string; args: string[] };
type CodexConfig = { mcp_servers?: Record<string, Partial<Server>> };

export type Client = {
  name: string;
  // Read the voz entry the app has now, or undefined when it has none
  current(): Promise<Server | undefined>;
  connect(server: Server): Promise<void>;
  restart?: boolean;
};

export const serverName = "voz";
export const pathMarker = "__VOZ_PATH__";

const home = homedir();
const desktopConfig = join(
  home,
  "Library/Application Support/Claude/claude_desktop_config.json",
);

export async function installedClients(): Promise<Client[]> {
  const path = await loginPath();
  const claude = Bun.which("claude", { PATH: path });
  const codex = Bun.which("codex", { PATH: path });
  return [
    claude &&
      cliClient("Claude Code", claude, claudeCodeEntry, ["--scope", "user"]),
    codex && cliClient("Codex", codex, codexEntry, []),
    existsSync("/Applications/Claude.app") && claudeDesktop,
  ].filter((client): client is Client => Boolean(client));
}

function cliClient(
  name: string,
  binary: string,
  entry: () => Promise<Server | undefined>,
  scope: string[],
): Client {
  return {
    name,
    current: entry,
    async connect(server) {
      if (await entry())
        await run([binary, "mcp", "remove", ...scope, serverName]);
      await run([
        binary,
        "mcp",
        "add",
        ...scope,
        serverName,
        "--",
        server.command,
        ...server.args,
      ]);
    },
  };
}

async function claudeCodeEntry() {
  const text = await readIfExists(join(home, ".claude.json"));
  return text ? serverIn(JSON.parse(text).mcpServers) : undefined;
}

async function codexEntry() {
  const text = await readIfExists(join(home, ".codex/config.toml"));
  return text
    ? serverIn((Bun.TOML.parse(text) as CodexConfig).mcp_servers)
    : undefined;
}

const claudeDesktop: Client = {
  name: "Claude Desktop",
  restart: true,
  async current() {
    const text = await readIfExists(desktopConfig);
    return text ? serverIn(JSON.parse(text).mcpServers) : undefined;
  },
  async connect(server) {
    const text = (await readIfExists(desktopConfig)) ?? "{}";
    await writeFile(desktopConfig, withServer(text, server));
  },
};

export function withServer(configText: string, server: Server) {
  const config = JSON.parse(configText);
  config.mcpServers = { ...config.mcpServers, [serverName]: server };
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function serverIn(servers?: Record<string, Partial<Server>>) {
  const entry = servers?.[serverName];
  return entry?.command
    ? { command: entry.command, args: entry.args ?? [] }
    : undefined;
}

export function sameServer(a: Server, b: Server) {
  return a.command === b.command && a.args.join("\0") === b.args.join("\0");
}

export function connectedMessage(connected: Client[], failures: string[]) {
  const names = connected.map((client) => client.name);
  const restart = connected.filter((client) => client.restart);
  return [
    names.length && `Connected Voz to ${list(names)}`,
    restart.length &&
      `Restart ${list(restart.map((client) => client.name))} to use it`,
    ...failures,
  ]
    .filter(Boolean)
    .join(". ");
}

function list(names: string[]) {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

async function readIfExists(path: string) {
  return existsSync(path) ? readFile(path, "utf8") : undefined;
}

async function run(command: string[]) {
  const child = Bun.spawn(command, { stdin: "ignore", stderr: "pipe" });
  const [error, code] = await Promise.all([
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new Error(error.trim().split("\n").at(-1) || `exit ${code}`);
}

// Voz starts without the login shell's PATH, where CLIs such as claude live
async function loginPath() {
  const shell = process.env.SHELL || "/bin/zsh";
  const child = Bun.spawn(
    [shell, "-ilc", `printf '${pathMarker}%s${pathMarker}' "$PATH"`],
    { stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 5000 },
  );
  return shellPath(await new Response(child.stdout).text());
}

export function shellPath(output: string) {
  const path = output.split(pathMarker)[1];
  if (!path) throw new Error("Could not read your shell PATH");
  return path;
}
