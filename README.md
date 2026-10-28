# Voz extensions

Extensions I built for [Voz](https://voz.joels.tech). Each folder is its own npm package. They are not part of Voz, and you don't need them to use it. To build your own, read [EXTENSIONS.md](https://github.com/Joelheile/voz/blob/main/EXTENSIONS.md).

| Package                                    | Say                     | What it does                                                                      |
| ------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------- |
| [voz-things3](voz-things3)                 | "add todo …"            | Adds a to-do to Things 3 with its project, dates, checklist and notes             |
| [voz-apple-calendar](voz-apple-calendar)   | "calendar …"            | Adds events, finds free time, and moves, resizes or renames events                |
| [voz-mcp](voz-mcp)                         | Press "Connect AI apps" | Lets Claude Code, Codex and Claude Desktop search your Voz history                |
| [voz-transcribe-file](voz-transcribe-file) | Drop a file             | Turns an audio or video file into a Markdown transcript with each speaker's turns |

They need Voz with extension API 2, which adds commands at the start of a dictation and `ctx.generate` for the on-device model. voz-transcribe-file needs API 3, which adds `audioDrop` and `ctx.transcribe`.

## Develop

```sh
cd voz-things3
bun install
bun test
voz dev .
```

`voz dev` loads the package into the running Voz and reloads it when you save.

## Publish

```sh
cd voz-things3
npm publish
```

npm asks for your 2FA code. Then anyone can run `voz install voz-things3`, and the `voz-package` keyword lists it in the Voz Extensions page.

- Voz runs the TypeScript as is, so there is no build step. Every file a package imports must be in `files` in its `package.json`. Run `npm pack --dry-run` to see what ships
- Publish a package only after a Voz release supports its `apiVersion`. Older Voz shows "Update Voz" instead of loading it
- Bump `version` before each publish. npm never accepts the same version twice

## How they read a dictation

The on-device model is small, and it fills fields the user never said. So each extension asks it only for what needs judgment, and code does the rest:

| Extension          | The model                                   | Code                                              |
| ------------------ | ------------------------------------------- | ------------------------------------------------- |
| voz-things3        | Title, project, steps and notes             | Dates, deadline, tags, spoken checklist and notes |
| voz-apple-calendar | Add or change, title, event words and place | Time, length, free time, calendar and which event |

Where code checks the model, it compares the result with the dictation. Code also does all date math with [chrono](https://github.com/wanasit/chrono).

## Sources for the MCP design

- Anthropic, [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- Anthropic, [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [MCP specification: tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP TypeScript SDK v2: tools](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools) and [client guide](https://ts.sdk.modelcontextprotocol.io/v2/documents/Documents.Client_Guide.html)
- [Connect local servers to Claude Desktop](https://modelcontextprotocol.io/quickstart/user)
- Nordic APIs, [8 tips and best practices for MCP server development](https://nordicapis.com/8-tips-and-best-practices-for-mcp-server-development/)
- Workato, [MCP server tool design](https://docs.workato.com/en/mcp/mcp-server-tool-design.html)
- Dedalus Labs, [Server guidelines](https://docs.dedaluslabs.ai/sdk/agents/guides/server-guidelines)
- Metorial, [Best MCP practices](https://metorial.com/blog/best-mcp-practices)
- [FastMCP](https://gofastmcp.com) and [xmcp](https://xmcp.dev/blog/fastmcp-alternatives), frameworks that keep servers short
