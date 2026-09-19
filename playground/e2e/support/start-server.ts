import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";

import { playgroundDir, serverLogPath } from "./paths.ts";

mkdirSync(path.dirname(serverLogPath), { recursive: true });
const log = createWriteStream(serverLogPath);

const serverEnvironment: NodeJS.ProcessEnv = { ...process.env, ASTRO_DEV_BACKGROUND: "0" };
// A normal `astro dev` establishes its own development environment. An
// inherited NODE_ENV suppresses the dev-only island timing attributes, while
// VITEST makes Astro skip its request middleware entirely.
delete serverEnvironment.NODE_ENV;
delete serverEnvironment.VITEST;

// Mirror Astro's output into a file so the auth setup can read the one-time
// code, and explicitly forward shutdown signals from Playwright to Astro.
const server = spawn(
  path.join(playgroundDir, "node_modules/.bin/astro"),
  ["dev", "--ignore-lock", "--port", "0"],
  {
    cwd: playgroundDir,
    env: serverEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

server.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  log.write(chunk);
});
server.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  log.write(chunk);
});

type ShutdownSignal = "SIGINT" | "SIGTERM";

let stopPromise: Promise<void> | undefined;
let finished = false;

function serverIsRunning() {
  return server.exitCode === null && server.signalCode === null;
}

function killServerOnWrapperExit() {
  if (!serverIsRunning()) return;
  try {
    server.kill("SIGKILL");
  } catch {
    // The child may have exited between the status check and kill call.
  }
}

process.once("exit", killServerOnWrapperExit);

function finish(callback: () => void) {
  if (finished) return;
  finished = true;
  process.removeListener("exit", killServerOnWrapperExit);
  log.end(callback);
}

function stopServer(signal: ShutdownSignal) {
  if (stopPromise !== undefined) return stopPromise;

  const stopped = Promise.withResolvers<void>();
  stopPromise = stopped.promise;

  if (!serverIsRunning()) {
    stopped.resolve();
    return stopPromise;
  }

  const forceKillTimer = setTimeout(() => {
    if (serverIsRunning()) server.kill("SIGKILL");
  }, 5_000);

  server.once("exit", () => {
    clearTimeout(forceKillTimer);
    stopped.resolve();
  });

  try {
    server.kill(signal);
  } catch {
    clearTimeout(forceKillTimer);
    stopped.resolve();
  }

  return stopPromise;
}

function handleSignal(signal: ShutdownSignal) {
  void stopServer(signal).then(() => {
    finish(() => process.kill(process.pid, signal));
  });
}

process.once("SIGINT", () => handleSignal("SIGINT"));
process.once("SIGTERM", () => handleSignal("SIGTERM"));

server.once("exit", (code, signal) => {
  if (stopPromise !== undefined) return;
  finish(() => {
    if (signal !== null) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
});

server.once("error", (error) => {
  console.error(error);
  finish(() => process.exit(1));
});
