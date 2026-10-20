import { format } from "node:util";
import { render } from "ink";
import App from "./app.jsx";
import { leaveAll } from "./bots.js";
import { log } from "./state.js";

let quitting = false;

for (const method of ["log", "info", "warn", "error"]) {
  console[method] = (...args) => log("warn", format(...args));
}

const app = render(<App onExit={() => quit()} />, {
  alternateScreen: true,
  exitOnCtrlC: false,
  patchConsole: false,
  incrementalRendering: true,
});

async function quit(error) {
  if (quitting) return;
  quitting = true;

  if (!error) log("info", "Removing bots and exiting");
  await leaveAll();
  app.unmount();
  await app.waitUntilExit().catch(() => {});

  if (error) process.stderr.write(`Fatal error: ${error?.stack ?? error}\n`);
  process.exit(error ? 1 : 0);
}

process.on("uncaughtException", quit);
process.on("unhandledRejection", quit);

for (const signal of ["SIGHUP", "SIGTERM", "SIGINT"]) {
  process.on(signal, () => quit());
}

app.waitUntilExit().catch(quit);

log("info", "Enter the game PIN to start");
