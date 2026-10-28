import { defineExtension } from "voz";
import {
  connectedMessage,
  installedClients,
  sameServer,
  serverName,
  type Server,
} from "./clients";

const server: Server = {
  command: process.execPath,
  args: [new URL("./history.ts", import.meta.url).pathname],
};

export default defineExtension((voz) => {
  // Voz moves Bun when it updates it, so repoint apps that are already connected
  refreshConnected().catch((error) =>
    console.log(`Could not refresh connected apps: ${error.message}`),
  );

  voz.registerAction({
    id: "connect",
    name: "Connect AI apps",
    async run(ctx) {
      const clients = await installedClients();
      if (!clients.length) {
        await copy(
          JSON.stringify({ mcpServers: { [serverName]: server } }, null, 2),
        );
        return ctx.notify(
          "No AI apps found. Copied the server config to paste into yours",
        );
      }
      const results = await Promise.allSettled(
        clients.map((client) => client.connect(server)),
      );
      const connected = clients.filter(
        (_, index) => results[index]!.status === "fulfilled",
      );
      const failures = results.flatMap((result, index) =>
        result.status === "rejected"
          ? [`${clients[index]!.name} failed: ${result.reason.message}`]
          : [],
      );
      ctx.notify(connectedMessage(connected, failures));
    },
  });
});

async function refreshConnected() {
  for (const client of await installedClients()) {
    const current = await client.current();
    if (current && !sameServer(current, server)) await client.connect(server);
  }
}

async function copy(text: string) {
  const pbcopy = Bun.spawn(["pbcopy"], { stdin: new Blob([text]) });
  if ((await pbcopy.exited) !== 0) throw new Error("pbcopy failed");
}
