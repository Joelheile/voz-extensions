import { defineExtension } from "voz";
import {
  connectedMessage,
  installedClients,
  list,
  sameServer,
  serverName,
  unconnected,
  type Server,
} from "./clients";

const server: Server = {
  command: process.execPath,
  args: [new URL("./history.ts", import.meta.url).pathname],
};

export default defineExtension((voz) => {
  const connect = voz.registerAction({
    id: "connect",
    name: "Connect AI apps",
    // Out of the panel until refreshConnected knows whether any app is connected, so it never flashes
    hidden: true,
    async run(ctx) {
      const installed = await installedClients();
      if (!installed.length) {
        await copy(
          JSON.stringify({ mcpServers: { [serverName]: server } }, null, 2),
        );
        return ctx.notify(
          "No AI apps found. Copied the server config to paste into yours",
        );
      }
      const clients = await unconnected(installed, server);
      if (!clients.length) {
        connect.update({ hidden: true });
        return ctx.notify(
          `Voz is already connected to ${list(installed.map((client) => client.name))}`,
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
      const alreadyConnected = clients.length < installed.length;
      connect.update({ hidden: alreadyConnected || connected.length > 0 });
      ctx.notify(connectedMessage(connected, failures));
    },
  });

  refreshConnected()
    .then((anyConnected) => connect.update({ hidden: anyConnected }))
    .catch((error) =>
      console.log(`Could not refresh connected apps: ${error.message}`),
    );
});

// Voz moves Bun when it updates it, so repoint apps that are already connected
async function refreshConnected() {
  const clients = await installedClients();
  const current = await Promise.all(clients.map((client) => client.current()));
  const moved = clients.filter(
    (_, index) => current[index] && !sameServer(current[index], server),
  );
  for (const client of moved) await client.connect(server);
  return current.some(Boolean);
}

async function copy(text: string) {
  const pbcopy = Bun.spawn(["pbcopy"], { stdin: new Blob([text]) });
  if ((await pbcopy.exited) !== 0) throw new Error("pbcopy failed");
}
