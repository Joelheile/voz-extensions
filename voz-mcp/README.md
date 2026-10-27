# voz-mcp

Connects Voz to [MCP](https://modelcontextprotocol.io) servers in both directions:

- **Client.** Say "agent" at the start of a dictation, and Voz calls a tool from your MCP servers.
- **History server.** AI apps such as Claude Desktop, Cursor or Claude Code can search what you dictated.

## Install

```sh
voz install voz-mcp
```

The client needs a Mac with Apple Intelligence. The history server runs with the copy of Bun that Voz downloads for extensions.

## Call MCP tools by voice

Put your servers in `~/.voz/mcp.json`. It uses the same format as Claude Desktop, so you can copy servers from `~/Library/Application Support/Claude/claude_desktop_config.json`.

```json
{
  "mcpServers": {
    "files": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/you/Documents"
      ]
    }
  }
}
```

Then say:

```
agent read the file notes.md in my documents
agent open an issue in joelheile/voz titled hotkey breaks after sleep
```

Voz starts each server when the extension loads. For each request, the on-device model first picks one tool from the list, then fills in that tool's arguments. Code keeps an optional argument only if you said its value, because the model tends to make values up. The answer shows as a notification, or Voz types it into the front app.

The client only supports servers that run as a local command (stdio). It sends the model up to 40 tools. Keep the list short, because the model picks better from fewer tools.

Each request calls one tool. It does not run a conversation or a sequence of dependent tools. Generated arguments are checked against the server's original JSON Schema before execution, including constraints omitted from the model's schema. Invalid arguments stop the command.

## Search your history from AI apps

In Voz, open Extensions, then run "Copy history server config". Paste the result into your AI app's MCP config, such as:

```json
{
  "mcpServers": {
    "voz-history": {
      "command": "/Users/you/Library/Application Support/voz/bun/1.4.3/bun",
      "args": ["/Users/you/.voz/packages/node_modules/voz-mcp/history.ts"]
    }
  }
}
```

The server has one tool, `search_dictations`. It searches by words, app and date, newest first. It opens the history database read-only. The app you connect it to can read your dictations, so only add it to apps you trust.

## Settings

| Setting         | Default           | What it does                                                                      |
| --------------- | ----------------- | --------------------------------------------------------------------------------- |
| Trigger word    | `agent`           | Word that starts a request                                                        |
| Servers file    | `~/.voz/mcp.json` | Your MCP servers, in Claude Desktop's format                                      |
| Show the answer | `notify`          | `notify` shows a short message. `insert` types the full answer into the front app |

## Write your own MCP server

Start with a local stdio server and simple object arguments supported by Voz's on-device schema. Remote HTTP servers and OAuth are not supported by this client. The [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) keeps it short. `history.ts` is a full example in about 100 lines. These rules help a small model use your tools:

- Have a few tools that each do a whole task, instead of one tool per API call.
- Write the description as you would for a new colleague: what the tool does, and when to use it.
- Describe each argument and give an example value.
- Make arguments optional when there is a sensible default.
- Return short text that people can read, not raw JSON.
- When nothing matches or an input is wrong, say what to try instead.
- Mark tools that only read with `readOnlyHint`.
