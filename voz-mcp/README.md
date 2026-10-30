# voz-mcp

I built this so Claude Code, Codex and Claude Desktop can look up what I dictated. It is an [MCP](https://modelcontextprotocol.io) server over your Voz history, and the apps search it by words, app and date.

Ask your AI app things like:

```
What did I dictate to Anna yesterday?
Find the invoice numbers I said in Mail last week
```

## Install

```sh
voz install voz-mcp
```

Then open the Voz panel and press **Connect AI apps**. Voz finds the AI apps on your Mac and adds a server named `voz` to each:

| App            | How Voz adds it                                                      |
| -------------- | -------------------------------------------------------------------- |
| Claude Code    | `claude mcp add --scope user voz`, for every project                 |
| Codex          | `codex mcp add voz`                                                  |
| Claude Desktop | Adds `voz` to `claude_desktop_config.json`. Restart Claude to use it |

Once one app is connected, the button leaves the panel. To connect an app you install later, open Extensions, select voz-mcp and press **Run** next to **Connect AI apps**. It connects only the apps that are not connected yet and leaves your other servers alone. When Voz updates its copy of Bun, the extension points connected apps to the new one.

If Voz finds none of these apps, it copies the server config, so you can paste it into any MCP app:

```json
{
  "mcpServers": {
    "voz": {
      "command": "/Users/you/Library/Application Support/voz/bun/1.4.3/bun",
      "args": ["/Users/you/.voz/packages/node_modules/voz-mcp/history.ts"]
    }
  }
}
```

## The tool

The server has one tool, `search_dictations`. It searches by words, app and date, newest first, and returns the local time, the app and the text of each dictation.

It opens the history database read-only, and it runs on your Mac. The app you connect can read your dictations, so connect only apps you trust.
