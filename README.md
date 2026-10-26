# Voz extensions

Extensions I built for [Voz](https://voz.joels.tech). Each folder is its own npm package. They are not part of Voz, and you don't need them to use it. To build your own, read [EXTENSIONS.md](https://github.com/Joelheile/voz/blob/main/EXTENSIONS.md).

| Package                      | Say          | What it does                                                            |
| ---------------------------- | ------------ | ----------------------------------------------------------------------- |
| [voz-things](voz-things)     | "todo …"     | Adds a to-do to Things 3 with its project, dates, checklist and notes   |
| [voz-calendar](voz-calendar) | "calendar …" | Adds time blocks to Apple Calendar and moves events                     |
| [voz-mcp](voz-mcp)           | "agent …"    | Calls tools on your MCP servers, and serves your Voz history to AI apps |

They need Voz with extension API 2, which adds commands at the start of a dictation and `ctx.generate` for the on-device model.

## Develop

```sh
cd voz-things
bun install
bun test
voz dev .
```

`voz dev` loads the package into the running Voz and reloads it when you save.

## Publish

```sh
cd voz-things
npm publish
```

Then anyone can run `voz install voz-things`.

## How they read a dictation

The on-device model is small, and it fills fields the user never said. So each extension asks it only for what needs judgment, and code does the rest:

| Extension    | The model                       | Code                                              |
| ------------ | ------------------------------- | ------------------------------------------------- |
| voz-things   | Title, project, steps and notes | Dates, deadline, tags, spoken checklist and notes |
| voz-calendar | Add or move, and a title        | Time, length, calendar and which event            |
| voz-mcp      | Which tool, and its arguments   | Drops optional arguments the user did not say     |

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
