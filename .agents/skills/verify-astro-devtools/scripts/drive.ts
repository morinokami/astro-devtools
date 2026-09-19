#!/usr/bin/env node
/**
 * drive.ts — the verification harness for astro-devtools.
 *
 * One executable, five jobs, all against an isolated `astro dev` of the
 * playground that this script itself started — never a dev server someone
 * else is running:
 *
 *   launch    build the package, start a playground dev server on a free
 *             port (`--ignore-lock --port 0`, the e2e suite's recipe) and a
 *             headless Chromium authorized with the one-time code read from
 *             that server's own log
 *   doctor    read-only health check of that server/browser pair
 *   browser   drive the page: navigate, open a dock panel, click and fill,
 *             read text, call an RPC, capture screenshots and ARIA snapshots
 *   mcp       talk to the dev server's MCP endpoint like a native client
 *   cleanup   stop what launch started; keep server.log, browser.log and
 *             evidence/
 *
 * Everything about one run lives in <repo>/.verify/<run-id>/;
 * <repo>/.verify/current names the run the other commands act on
 * unless ASTRO_DEVTOOLS_VERIFY_RUN points at a run directory. The browser
 * belongs to a detached daemon (`drive.ts daemon`, internal) that keeps one
 * Playwright page open between commands and answers them over a loopback
 * HTTP port, so a sequence of `browser` commands acts on one continuous
 * session — the page stays where the previous command left it.
 *
 * The page-driving primitives (authorize, switchPanel, rpcCall, ...) are the
 * playground e2e suite's own helpers, imported from
 * playground/e2e/support/helpers.ts, so this harness and the e2e suite
 * cannot disagree about how a trusted DevTools client is obtained.
 */
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
// Astro colors its output and these logs are read back as text. Node's own
// stripper covers the whole VT escape grammar, not just the SGR sequences a
// hand-written pattern tends to list.
import { stripVTControlCharacters as stripAnsi } from "node:util";

import {
  authorize,
  dockEntries,
  installDeepFind,
  isTrusted,
  rpcCall,
  switchPanel,
  waitFor,
} from "../../../../playground/e2e/support/helpers.ts";

const scriptPath = import.meta.filename;
const skillDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(skillDir, "../../..");
const playgroundDir = path.join(repoRoot, "playground");
// Outside the playground on purpose: Vite watches the project root, and
// evidence must not be written into the app under test.
const verifyRoot = path.join(repoRoot, ".verify");
const currentRunPointer = path.join(verifyRoot, "current");

/** Short names accepted by `browser panel` for the integration's own entries. */
const PANEL_ENTRY_IDS: Record<string, string> = {
  overview: "astro-devtools:overview",
  islands: "astro-devtools:islands",
  routes: "astro-devtools:routes",
  actions: "astro-devtools:actions",
  config: "astro-devtools:config",
  docs: "astro-devtools:docs",
};

/**
 * What "the panel has rendered" means per entry: a CSS list that matches
 * the panel's rows or, when the panel has nothing to list, its note.
 */
const PANEL_READY: Record<string, string> = {
  "astro-devtools:overview": "#astro-version",
  "astro-devtools:islands":
    '[data-testid="island-row"], [data-testid="server-island-row"], ' +
    '[data-testid="server-islands-note"], p:has-text("No islands on this page."), ' +
    'p:has-text("Islands are page-scoped.")',
  "astro-devtools:routes": '[data-testid="route-row"], p:has-text("No routes")',
  "astro-devtools:actions":
    'button[aria-expanded][title], p:has-text("No actions"), ' +
    'p:has-text("Could not load the actions file.")',
  "astro-devtools:config": '[data-testid="config-row"]',
  "astro-devtools:docs": 'iframe[src^="https://docs.astro.build"]',
};

const USAGE = `usage: drive.ts <command> [options]

  launch [--page <path>] [--no-prepare]   build, start server + authorized browser
  doctor                                  read-only health check (exit 1 when unhealthy)
  url                                     print the dev server's base URL
  log [--tail <n>] [--grep <regex>]       print the dev server log (ANSI stripped)
  http <path> [--method <m>] [--body <s>] fetch a dev-server URL, print status and body
  browser <subcommand> ...                drive the page (see \`browser help\`)
  mcp tools | mcp call <tool> [--args <json>]
  runs                                    list run directories and whether they are alive
  cleanup [--run <dir>]                   stop server + browser, drop scratch state, keep evidence
`;

const BROWSER_USAGE = `usage: drive.ts browser <subcommand> [options]

  goto <path> [--no-wait]                 navigate; waits for a trusted DevTools client
  panel <entry> [--ready <css>]           open a dock entry (overview|islands|routes|actions|
                                          config|docs or a full id) and wait for its content
  dock <title> [--group <title>]          open an entry the way a user does: through the dock
                                          (opens its group first; default group "Astro")
  click|hover|focus <locator> [--force]   act on one element (--force skips the hit-target check)
  box <locator>                           bounding box (+ center cx, cy) of the first match
  mouse move|click|down|up <x> <y>        raw pointer input at viewport coordinates
  fill <locator> --value <text>           replace an input's text
  select <locator> --option <value|label> choose a <select> option
  press <key> [<locator>]                 press a key on the page or an element
  wait <locator> [--state visible|attached|hidden|detached] [--timeout <ms>]
  text <locator> [--save <name>]          text content of every match
  count <locator>                         number of matches
  attr <locator> --attribute <name> [--all] an attribute of the first match (or of every match)
  scroll top|bottom | scroll <locator>    scroll the page or bring an element into view
  screenshot <name> [--full]              evidence/<name>.png
  aria <name> [<locator>]                 evidence/<name>.aria.txt (ARIA snapshot)
  rpc <name> [--save <name>]              call a DevTools RPC query from the page
  entries                                 the dock's registered entries
  requests [--match <substr>] [--clear]   same-origin requests seen since load/clear
  navigations [--clear]                   document loads with the script that started them
  console [--all | --match <substr>] [--clear]  console errors and page errors collected
                                          so far (--all/--match: every console message)
  state                                   url, title, trusted, counters
  eval <js-expression> [--save <name>]    last resort: evaluate JS in the page

<locator> is one of:
  --role <role> --name <text> [--exact]   ARIA role + accessible name (preferred)
  --label <text> [--exact]                form control by its label
  --text <text> [--exact]                 element by visible text
  --placeholder <text>                    input by placeholder
  --testid <id>                           [data-testid="<id>"]
  --selector <css>                        CSS (Playwright syntax; pierces shadow DOM)
plus optional --within <css> (scope), --has-text <text> (filter), --nth <i>.
--save <name> on text/count/attr/rpc/entries/requests/console/eval/http/mcp writes
evidence/<name>.json as well.
`;

interface Args {
  positionals: string[];
  flags: Record<string, string | true>;
}

const BOOLEAN_FLAGS = new Set(["all", "full", "exact", "clear", "no-prepare", "no-wait", "force"]);

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (token.startsWith("--") && token.length > 2) {
      const equals = token.indexOf("=");
      if (equals !== -1) {
        flags[token.slice(2, equals)] = token.slice(equals + 1);
        continue;
      }
      const name = token.slice(2);
      if (BOOLEAN_FLAGS.has(name) || index + 1 >= argv.length) {
        flags[name] = true;
        continue;
      }
      index += 1;
      flags[name] = argv[index] ?? "";
      continue;
    }
    positionals.push(token);
  }
  return { positionals, flags };
}

function flagString(args: Args, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

function requireFlag(args: Args, name: string): string {
  const value = flagString(args, name);
  if (value === undefined) throw new Error(`--${name} <value> is required`);
  return value;
}

function requirePositional(args: Args, index: number, label: string): string {
  const value = args.positionals[index];
  if (value === undefined) throw new Error(`${label} is required`);
  return value;
}

/* ---------------------------------------------------------------- main */

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "launch":
      await launch(parseArgs(rest));
      return;
    case "doctor":
      await doctor();
      return;
    case "url":
      process.stdout.write(`${readServerUrl(requireRunDir())}\n`);
      return;
    case "log":
      serverLog(parseArgs(rest));
      return;
    case "http":
      await httpRequest(parseArgs(rest));
      return;
    case "browser":
      await browserClient(rest);
      return;
    case "mcp":
      await mcp(parseArgs(rest));
      return;
    case "runs":
      listRuns();
      return;
    case "cleanup":
      await cleanup(parseArgs(rest));
      return;
    case "daemon":
      await daemon(parseArgs(rest));
      return;
    case "help":
    case "--help":
    case undefined:
      process.stdout.write(USAGE);
      return;
    default:
      throw new Error(`unknown command "${command}"\n${USAGE}`);
  }
}

function output(value: unknown): void {
  if (typeof value === "string") {
    process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/* ------------------------------------------------------- run directory */

function currentRunDir(): string | undefined {
  const fromEnv = process.env.ASTRO_DEVTOOLS_VERIFY_RUN;
  if (fromEnv) return path.resolve(fromEnv);
  if (!fs.existsSync(currentRunPointer)) return undefined;
  const pointed = fs.readFileSync(currentRunPointer, "utf8").trim();
  return pointed === "" ? undefined : pointed;
}

function requireRunDir(): string {
  const runDir = currentRunDir();
  if (runDir === undefined || !fs.existsSync(runDir)) {
    throw new Error(
      "no verification run: run `drive.ts launch` first " +
        "(or point ASTRO_DEVTOOLS_VERIFY_RUN at a run directory)",
    );
  }
  return runDir;
}

const runFiles = {
  serverPid: (runDir: string) => path.join(runDir, "server.pid"),
  serverLog: (runDir: string) => path.join(runDir, "server.log"),
  serverUrl: (runDir: string) => path.join(runDir, "server.url"),
  browserPid: (runDir: string) => path.join(runDir, "browser.pid"),
  browserPort: (runDir: string) => path.join(runDir, "browser.port"),
  browserLog: (runDir: string) => path.join(runDir, "browser.log"),
  auth: (runDir: string) => path.join(runDir, "auth.json"),
  evidence: (runDir: string) => path.join(runDir, "evidence"),
  journal: (runDir: string) => path.join(runDir, "evidence", "journal.log"),
};

function readNumberFile(file: string): number | undefined {
  if (!fs.existsSync(file)) return undefined;
  const value = Number.parseInt(fs.readFileSync(file, "utf8").trim(), 10);
  return Number.isFinite(value) ? value : undefined;
}

function readServerUrl(runDir: string): string {
  const file = runFiles.serverUrl(runDir);
  if (!fs.existsSync(file)) throw new Error(`no server URL recorded in ${runDir}`);
  return fs.readFileSync(file, "utf8").trim();
}

function isAlive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function runIsAlive(runDir: string): boolean {
  return (
    isAlive(readNumberFile(runFiles.serverPid(runDir))) ||
    isAlive(readNumberFile(runFiles.browserPid(runDir)))
  );
}

function journal(runDir: string, line: string): void {
  fs.mkdirSync(runFiles.evidence(runDir), { recursive: true });
  fs.appendFileSync(runFiles.journal(runDir), `${new Date().toISOString()} ${line}\n`);
}

function evidencePath(runDir: string, name: string, extension: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "-");
  fs.mkdirSync(runFiles.evidence(runDir), { recursive: true });
  return path.join(
    runFiles.evidence(runDir),
    safe.endsWith(extension) ? safe : `${safe}${extension}`,
  );
}

/* --------------------------------------------------------------- launch */

async function launch(args: Args): Promise<void> {
  const initialPage = flagString(args, "page") ?? "/";
  const existing = currentRunDir();
  if (existing !== undefined && fs.existsSync(existing) && runIsAlive(existing)) {
    throw new Error(
      `a verification run is still up in ${existing}; run \`drive.ts cleanup\` first`,
    );
  }
  if (args.flags["no-prepare"] !== true) prepare();

  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const runDir = path.join(verifyRoot, `${stamp}-${process.pid}`);
  fs.mkdirSync(runFiles.evidence(runDir), { recursive: true });
  fs.writeFileSync(currentRunPointer, `${runDir}\n`);
  journal(runDir, `launch --page ${initialPage}`);

  const server = await startServer(runDir);
  process.stderr.write(`[drive] dev server ${server.url} (pid ${server.pid})\n`);
  const browser = await startBrowserDaemon(runDir, initialPage);
  process.stderr.write(`[drive] browser daemon ready (pid ${browser.pid}, port ${browser.port})\n`);
  output({
    runDir,
    url: server.url,
    serverPid: server.pid,
    browserPid: browser.pid,
    browserPort: browser.port,
    evidenceDir: runFiles.evidence(runDir),
    page: browser.pageUrl,
    next: "drive.ts doctor, then drive.ts browser ...",
  });
}

/**
 * The playground resolves astro-devtools through the package's dist/, so a
 * launch first runs the (cached) package build; the headless-shell install
 * task is a no-op when the browser is already present.
 */
function prepare(): void {
  for (const task of ["astro-devtools#build", "playground#e2e-browser"]) {
    process.stderr.write(`[drive] vp run ${task}\n`);
    const result = spawnSync("vp", ["run", task], { cwd: repoRoot, stdio: ["ignore", 2, 2] });
    if (result.error) {
      throw new Error(
        `could not run vp (${result.error.message}); run \`vp run ${task}\` yourself, ` +
          "then relaunch with --no-prepare",
      );
    }
    if (result.status !== 0) throw new Error(`vp run ${task} exited with ${result.status}`);
  }
}

function astroBin(): string {
  return path.join(
    fs.realpathSync(path.join(playgroundDir, "node_modules/astro")),
    "bin/astro.mjs",
  );
}

async function startServer(runDir: string): Promise<{ pid: number; url: string }> {
  const logPath = runFiles.serverLog(runDir);
  const logFd = fs.openSync(logPath, "a");
  // Mirror e2e/support/start-server.ts: a normal `astro dev` sets up its own
  // environment (an inherited NODE_ENV drops the dev-only island attributes,
  // VITEST makes Astro skip its middleware), and ASTRO_DEV_BACKGROUND=0 keeps
  // Astro's agent auto-detection from backgrounding the server a second time.
  const env: NodeJS.ProcessEnv = { ...process.env, ASTRO_DEV_BACKGROUND: "0" };
  delete env.NODE_ENV;
  delete env.VITEST;
  const child = spawn(process.execPath, [astroBin(), "dev", "--ignore-lock", "--port", "0"], {
    cwd: playgroundDir,
    env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  fs.closeSync(logFd);
  child.unref();
  const pid = child.pid;
  if (pid === undefined) throw new Error("astro dev did not start");
  fs.writeFileSync(runFiles.serverPid(runDir), `${pid}\n`);

  const url = await waitFor(
    () => {
      if (!isAlive(pid)) {
        throw new Error(`astro dev exited; last lines of ${logPath}:\n${tailFile(logPath, 20)}`);
      }
      const match = stripAnsi(fs.readFileSync(logPath, "utf8")).match(
        /Local\s+(http:\/\/localhost:\d+)\/?/,
      );
      return match?.[1];
    },
    { timeoutMs: 90_000, intervalMs: 250, label: "the dev server's Local URL in server.log" },
  );
  if (url === undefined) throw new Error("no Local URL captured");
  fs.writeFileSync(runFiles.serverUrl(runDir), `${url}\n`);
  return { pid, url };
}

async function startBrowserDaemon(
  runDir: string,
  initialPage: string,
): Promise<{ pid: number; port: number; pageUrl: string }> {
  const logPath = runFiles.browserLog(runDir);
  const logFd = fs.openSync(logPath, "a");
  const child = spawn(
    process.execPath,
    [scriptPath, "daemon", "--run", runDir, "--page", initialPage],
    { cwd: repoRoot, env: process.env, detached: true, stdio: ["ignore", logFd, logFd] },
  );
  fs.closeSync(logFd);
  child.unref();
  const pid = child.pid;
  if (pid === undefined) throw new Error("the browser daemon did not start");
  fs.writeFileSync(runFiles.browserPid(runDir), `${pid}\n`);

  const health = await waitFor(
    async () => {
      if (!isAlive(pid)) {
        throw new Error(
          `the browser daemon exited; last lines of ${logPath}:\n${tailFile(logPath, 30)}`,
        );
      }
      const port = readNumberFile(runFiles.browserPort(runDir));
      if (port === undefined) return undefined;
      return daemonHealth(port).catch(() => undefined);
    },
    { timeoutMs: 120_000, intervalMs: 500, label: "the browser daemon to report healthy" },
  );
  if (health === undefined) throw new Error("the browser daemon never reported healthy");
  return { pid, port: health.port, pageUrl: health.pageUrl };
}

function tailFile(file: string, lines: number): string {
  if (!fs.existsSync(file)) return "(no log)";
  return stripAnsi(fs.readFileSync(file, "utf8")).trimEnd().split("\n").slice(-lines).join("\n");
}

/* --------------------------------------------------------------- doctor */

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** Set on checks that do not fail the doctor but deserve attention. */
  warning?: true;
}

async function doctor(): Promise<void> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, warning?: true): void => {
    checks.push(warning ? { name, ok, detail, warning } : { name, ok, detail });
  };

  const runDir = currentRunDir();
  if (runDir === undefined || !fs.existsSync(runDir)) {
    add("run", false, "no verification run; `drive.ts launch` starts one");
    output({ healthy: false, checks });
    process.exit(1);
  }
  add("run", true, runDir);

  const serverPid = readNumberFile(runFiles.serverPid(runDir));
  add(
    "server.process",
    isAlive(serverPid),
    `pid ${serverPid ?? "?"} ${isAlive(serverPid) ? "alive" : "not running"}`,
  );

  let url: string | undefined;
  try {
    url = readServerUrl(runDir);
    add("server.url", true, url);
  } catch (error) {
    add("server.url", false, (error as Error).message);
  }

  if (url !== undefined) {
    const port = Number(new URL(url).port);
    const owners = listeningPids(port);
    if (owners === undefined) {
      add("server.port", true, `port ${port}: owner not checked (lsof unavailable)`, true);
    } else {
      const ours = serverPid !== undefined && owners.includes(serverPid);
      add(
        "server.port",
        ours,
        `port ${port} listened on by pid(s) ${owners.join(",") || "none"}; ours is ${serverPid ?? "?"}`,
      );
    }
    const standalone = await fetchText(`${url}/__devtools/`).catch((error: Error) => ({
      status: 0,
      text: error.message,
    }));
    add(
      "server.devtools",
      standalone.status === 200 && standalone.text.includes("Devframes"),
      `GET /__devtools/ -> ${standalone.status}${standalone.status === 200 ? "" : ` ${standalone.text.slice(0, 120)}`}`,
    );
    const connection = await fetchJson<{ mcp?: { path?: string } }>(
      `${url}/__astro-devtools/__connection.json`,
    ).catch(() => undefined);
    add(
      "server.mcp",
      connection?.mcp?.path === "__mcp",
      connection === undefined
        ? "GET /__astro-devtools/__connection.json failed"
        : `mcp.path = ${JSON.stringify(connection.mcp?.path)}`,
    );
    const log = stripAnsi(fs.readFileSync(runFiles.serverLog(runDir), "utf8"));
    add(
      "server.log",
      !log.includes("[DF8111]"),
      log.includes("[DF8111]")
        ? "DF8111 client-module-resolution warning present"
        : "no DF8111 warning",
      log.includes("[DF8111]") ? true : undefined,
    );
    const errorLines = log.split("\n").filter((line) => /\[ERROR\]/.test(line));
    add(
      "server.errors",
      true,
      `${errorLines.length} [ERROR] line(s) in server.log (the failing server island fixture is expected to add some)`,
      errorLines.length > 0 ? true : undefined,
    );
  }

  const distDir = path.join(repoRoot, "packages/astro-devtools/dist");
  const distStamp = newestMtime(distDir);
  const srcStamp = Math.max(
    newestMtime(path.join(repoRoot, "packages/astro-devtools/src")),
    newestMtime(path.join(repoRoot, "packages/ui/src")),
  );
  if (distStamp === 0)
    add("build", false, "packages/astro-devtools/dist is missing; `vp run astro-devtools#build`");
  else if (srcStamp > distStamp)
    add(
      "build",
      true,
      "a source file is newer than dist/ — launch rebuilds by default; if this run predates the change, cleanup and relaunch",
      true,
    );
  else add("build", true, `dist/ newer than src/ (${new Date(distStamp).toISOString()})`);

  const browserPid = readNumberFile(runFiles.browserPid(runDir));
  add(
    "browser.process",
    isAlive(browserPid),
    `pid ${browserPid ?? "?"} ${isAlive(browserPid) ? "alive" : "not running"}`,
  );
  const browserPort = readNumberFile(runFiles.browserPort(runDir));
  if (browserPort === undefined) {
    add("browser.daemon", false, `no browser.port yet; see ${runFiles.browserLog(runDir)}`);
  } else {
    const health = await daemonHealth(browserPort).catch((error: Error) => ({
      ok: false,
      error: error.message,
      trusted: false,
      pageUrl: "",
      port: browserPort,
    }));
    add(
      "browser.daemon",
      health.ok,
      health.ok
        ? `port ${browserPort}, page ${health.pageUrl}`
        : `port ${browserPort} unreachable: ${"error" in health ? health.error : "?"}`,
    );
    add(
      "browser.trusted",
      health.trusted,
      health.trusted
        ? "the page's DevTools client is trusted"
        : "the page's DevTools client is NOT trusted — re-authorize by relaunching",
    );
  }

  // Foreign instances: never driven, only reported so an agent does not
  // mistake them for ours.
  const status = spawnSync(process.execPath, [astroBin(), "dev", "status"], {
    cwd: playgroundDir,
    encoding: "utf8",
  });
  const statusLine = stripAnsi(`${status.stdout}${status.stderr}`).trim().split("\n").at(-1) ?? "";
  add(
    "foreign.lockfile",
    true,
    `astro dev status: ${statusLine || "(no output)"}`,
    /running at/.test(statusLine) ? true : undefined,
  );
  const port4321 = listeningPids(4321);
  if (port4321 !== undefined && port4321.length > 0) {
    add(
      "foreign.port4321",
      true,
      `port 4321 is held by pid(s) ${port4321.join(",")} — not this run's server; do not drive or kill it`,
      true,
    );
  }
  const otherLiveRuns = fs.existsSync(verifyRoot)
    ? fs
        .readdirSync(verifyRoot)
        .map((name) => path.join(verifyRoot, name))
        .filter((dir) => dir !== runDir && fs.statSync(dir).isDirectory() && runIsAlive(dir))
    : [];
  if (otherLiveRuns.length > 0)
    add(
      "runs.other",
      true,
      `other live runs: ${otherLiveRuns.join(", ")} (drive.ts cleanup --run <dir> stops one)`,
      true,
    );

  const healthy = checks.every((check) => check.ok);
  output({ healthy, checks });
  if (!healthy) process.exit(1);
}

function newestMtime(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const stamp = fs.statSync(path.join(entry.parentPath, entry.name)).mtimeMs;
    if (stamp > newest) newest = stamp;
  }
  return newest;
}

/** PIDs listening on a TCP port via lsof; undefined when lsof is unavailable. */
function listeningPids(port: number): number[] | undefined {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  });
  if (result.error) return undefined;
  return result.stdout
    .split("\n")
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isFinite(pid));
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const response = await fetch(url);
  return { status: response.status, text: await response.text() };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return (await response.json()) as T;
}

interface DaemonHealth {
  ok: boolean;
  port: number;
  pageUrl: string;
  trusted: boolean;
}

function daemonHealth(port: number): Promise<DaemonHealth> {
  return fetchJson<DaemonHealth>(`http://127.0.0.1:${port}/health`);
}

/* ------------------------------------------------------- log and http */

function serverLog(args: Args): void {
  const runDir = requireRunDir();
  let lines = stripAnsi(fs.readFileSync(runFiles.serverLog(runDir), "utf8"))
    .trimEnd()
    .split("\n");
  const grep = flagString(args, "grep");
  if (grep !== undefined) {
    const pattern = new RegExp(grep);
    lines = lines.filter((line) => pattern.test(line));
  }
  const tail = flagString(args, "tail");
  if (tail !== undefined) lines = lines.slice(-Number(tail));
  output(`${lines.join("\n")}\n`);
}

async function httpRequest(args: Args): Promise<void> {
  const runDir = requireRunDir();
  const target = requirePositional(args, 0, "<path>");
  const url = target.startsWith("http") ? target : `${readServerUrl(runDir)}${target}`;
  const method = flagString(args, "method") ?? "GET";
  const body = flagString(args, "body");
  const response = await fetch(url, {
    method,
    redirect: "manual",
    ...(body === undefined
      ? {}
      : {
          body,
          headers: { "content-type": flagString(args, "content-type") ?? "application/json" },
        }),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON; keep the text.
  }
  const result = {
    url,
    method,
    status: response.status,
    contentType: response.headers.get("content-type"),
    location: response.headers.get("location"),
    body: typeof parsed === "string" && parsed.length > 4000 ? `${parsed.slice(0, 4000)}…` : parsed,
  };
  saveEvidence(runDir, args, result);
  output(result);
}

function saveEvidence(runDir: string, args: Args, result: unknown): string | undefined {
  const name = flagString(args, "save");
  if (name === undefined) return undefined;
  const file = evidencePath(runDir, name, ".json");
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  return file;
}

/* ------------------------------------------------------------------ mcp */

interface McpResponse {
  id?: unknown;
  result?: unknown;
  error?: { message?: unknown };
}

/**
 * Dial the MCP endpoint the way a native client does (ported from
 * e2e/server.test.ts): __connection.json names the path, then the
 * Streamable HTTP handshake opens a session for the returned request
 * function.
 */
async function connectMcp(
  base: string,
): Promise<(method: string, params?: unknown) => Promise<unknown>> {
  const connectionUrl = `${base}/__astro-devtools/__connection.json`;
  const connection = await fetchJson<{ mcp?: { path?: string } }>(connectionUrl);
  const mcpPath = connection.mcp?.path;
  if (mcpPath === undefined) {
    throw new Error(`no mcp entry in __connection.json: ${JSON.stringify(connection)}`);
  }
  const endpoint = new URL(mcpPath, connectionUrl).href;
  let sessionId: string | undefined;
  let protocolVersion: string | undefined;
  let nextId = 1;

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(sessionId === undefined ? {} : { "mcp-session-id": sessionId }),
        ...(protocolVersion === undefined ? {} : { "mcp-protocol-version": protocolVersion }),
      },
      body: JSON.stringify(body),
    });
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const messages: unknown[] = contentType.includes("text/event-stream")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => JSON.parse(line.slice("data:".length)) as unknown)
      : text === ""
        ? []
        : [JSON.parse(text) as unknown];
    return { status: response.status, messages };
  };

  const request = async (method: string, params: unknown = {}): Promise<unknown> => {
    const id = nextId;
    nextId += 1;
    const { status, messages } = await post({ jsonrpc: "2.0", id, method, params });
    const reply = messages
      .filter((message): message is McpResponse => typeof message === "object" && message !== null)
      .find((message) => message.id === id);
    if (reply === undefined) throw new Error(`no response to ${method} (HTTP ${status})`);
    if (reply.error !== undefined)
      throw new Error(`${method} failed: ${JSON.stringify(reply.error)}`);
    return reply.result;
  };

  const initialized = (await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "verify-astro-devtools", version: "0.0.0" },
  })) as { protocolVersion?: string };
  protocolVersion = initialized.protocolVersion;
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  return request;
}

async function mcp(args: Args): Promise<void> {
  const runDir = requireRunDir();
  const base = readServerUrl(runDir);
  const subcommand = requirePositional(args, 0, "tools | call <tool>");
  const request = await connectMcp(base);
  if (subcommand === "tools") {
    const { tools } = (await request("tools/list")) as {
      tools: { name: string; description?: string; annotations?: { readOnlyHint?: boolean } }[];
    };
    const result = tools.map((tool) => ({
      name: tool.name,
      readOnlyHint: tool.annotations?.readOnlyHint,
      description: tool.description,
    }));
    saveEvidence(runDir, args, result);
    output(result);
    return;
  }
  if (subcommand === "call") {
    const name = requirePositional(args, 1, "<tool>");
    const rawArgs = flagString(args, "args");
    const toolArgs = rawArgs === undefined ? {} : (JSON.parse(rawArgs) as unknown);
    const result = (await request("tools/call", { name, arguments: toolArgs })) as {
      isError?: boolean;
      content?: { type: string; text?: string }[];
    };
    const text = result.content?.find((entry) => entry.type === "text")?.text;
    let data: unknown = text;
    try {
      data = text === undefined ? undefined : JSON.parse(text);
    } catch {
      // Not JSON; keep the text.
    }
    const summary = { tool: name, isError: result.isError ?? false, data };
    saveEvidence(runDir, args, summary);
    output(summary);
    return;
  }
  throw new Error(`unknown mcp subcommand "${subcommand}" (tools | call <tool>)`);
}

/* -------------------------------------------------------- runs, cleanup */

function listRuns(): void {
  if (!fs.existsSync(verifyRoot)) {
    output([]);
    return;
  }
  const current = currentRunDir();
  const runs = fs
    .readdirSync(verifyRoot)
    .map((name) => path.join(verifyRoot, name))
    .filter((dir) => fs.statSync(dir).isDirectory())
    .map((dir) => ({
      runDir: dir,
      current: dir === current,
      serverPid: readNumberFile(runFiles.serverPid(dir)),
      browserPid: readNumberFile(runFiles.browserPid(dir)),
      alive: runIsAlive(dir),
      evidenceFiles: fs.existsSync(runFiles.evidence(dir))
        ? fs.readdirSync(runFiles.evidence(dir)).length
        : 0,
    }));
  output(runs);
}

async function cleanup(args: Args): Promise<void> {
  const explicit = flagString(args, "run");
  const runDir = explicit === undefined ? currentRunDir() : path.resolve(explicit);
  if (runDir === undefined || !fs.existsSync(runDir)) {
    output({ cleaned: false, detail: "no verification run to clean up" });
    return;
  }
  if (!path.resolve(runDir).startsWith(`${verifyRoot}${path.sep}`)) {
    throw new Error(`refusing to clean up ${runDir}: not under ${verifyRoot}`);
  }
  const report: Record<string, string> = { runDir };

  // The daemon owns the browser: ask it to close cleanly, then make sure.
  const browserPort = readNumberFile(runFiles.browserPort(runDir));
  const browserPid = readNumberFile(runFiles.browserPid(runDir));
  if (browserPort !== undefined && isAlive(browserPid)) {
    await fetch(`http://127.0.0.1:${browserPort}/shutdown`, { method: "POST" }).catch(
      () => undefined,
    );
  }
  report.browser = await stopProcess(browserPid);
  report.server = await stopProcess(readNumberFile(runFiles.serverPid(runDir)));

  for (const file of [
    runFiles.serverPid,
    runFiles.browserPid,
    runFiles.browserPort,
    runFiles.auth,
  ]) {
    fs.rmSync(file(runDir), { force: true });
  }
  if (
    currentRunDir() === runDir &&
    fs.existsSync(currentRunPointer) &&
    !process.env.ASTRO_DEVTOOLS_VERIFY_RUN
  ) {
    fs.rmSync(currentRunPointer, { force: true });
  }
  journal(runDir, `cleanup (${report.server}; browser ${report.browser})`);
  report.kept = `${runFiles.evidence(runDir)}, ${runFiles.serverLog(runDir)}, ${runFiles.browserLog(runDir)}`;
  output(report);
}

async function stopProcess(pid: number | undefined): Promise<string> {
  if (pid === undefined) return "no pid recorded";
  if (!isAlive(pid)) return `pid ${pid} was not running`;
  signalTree(pid, "SIGTERM");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && isAlive(pid)) await sleep(100);
  if (!isAlive(pid)) return `pid ${pid} stopped (SIGTERM)`;
  signalTree(pid, "SIGKILL");
  const hardDeadline = Date.now() + 3_000;
  while (Date.now() < hardDeadline && isAlive(pid)) await sleep(100);
  return isAlive(pid) ? `pid ${pid} STILL ALIVE after SIGKILL` : `pid ${pid} killed (SIGKILL)`;
}

/** Signal the whole process group (launch spawns detached, so pid = pgid). */
function signalTree(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone.
    }
  }
}

/* -------------------------------------------------------- browser client */

async function browserClient(argv: string[]): Promise<void> {
  if (argv[0] === undefined || argv[0] === "help") {
    process.stdout.write(BROWSER_USAGE);
    return;
  }
  const runDir = requireRunDir();
  const port = readNumberFile(runFiles.browserPort(runDir));
  if (port === undefined) {
    throw new Error(
      `no browser daemon for ${runDir} (launch failed or is still starting); see ${runFiles.browserLog(runDir)}`,
    );
  }
  const response = await fetch(`http://127.0.0.1:${port}/cmd`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ argv }),
  }).catch((error: Error) => {
    throw new Error(
      `browser daemon on port ${port} is unreachable (${error.message}); run \`drive.ts doctor\``,
    );
  });
  const payload = (await response.json()) as { ok: boolean; result?: unknown; error?: string };
  if (!payload.ok) throw new Error(payload.error ?? "browser command failed");
  const result = payload.result;
  if (typeof result === "object" && result !== null && "__raw" in result) {
    output(String((result as { __raw: unknown }).__raw));
    return;
  }
  output(result);
}

/* --------------------------------------------------------------- daemon */

interface RequestRecord {
  at: string;
  method: string;
  path: string;
  status: number;
}

interface ConsoleRecord {
  at: string;
  type: string;
  text: string;
}

interface Session {
  runDir: string;
  base: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /** Console errors and uncaught page errors, the failure signal. */
  errors: string[];
  /** Every console message, for reading what the page and Vite report. */
  console: ConsoleRecord[];
  requests: RequestRecord[];
  /** Document navigations with their initiators, for "who reloaded the page?". */
  navigations: NavigationRecord[];
}

interface NavigationRecord {
  at: string;
  url: string;
  initiator: string;
  stack: string[];
}

async function loadPlaywright(): Promise<{ chromium: typeof import("@playwright/test").chromium }> {
  // pnpm keeps @playwright/test's own dependency tree next to its real
  // location, so resolution has to hop through realpaths: playground ->
  // @playwright/test -> playwright (which exports the browser launchers).
  const fromPlayground = createRequire(path.join(playgroundDir, "package.json"));
  const testEntry = fs.realpathSync(fromPlayground.resolve("@playwright/test"));
  const fromTest = createRequire(testEntry);
  const playwrightEntry = fs.realpathSync(fromTest.resolve("playwright"));
  const playwright = (await import(pathToFileURL(playwrightEntry).href)) as {
    default?: { chromium: typeof import("@playwright/test").chromium };
    chromium?: typeof import("@playwright/test").chromium;
  };
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  if (chromium === undefined) throw new Error(`no chromium export in ${playwrightEntry}`);
  return { chromium };
}

/** Same-origin requests worth keeping: not Vite modules or hub assets. */
function isNoteworthyRequest(pathname: string): boolean {
  if (/^\/(?:@|node_modules\/|__devtools\/|__devtools-)/.test(pathname)) return false;
  return !/\.(?:m?js|tsx?|jsx|css|svg|png|ico|map|woff2?|astro|vue|svelte)$/.test(pathname);
}

async function daemon(args: Args): Promise<void> {
  const runDir = requireFlag(args, "run");
  const initialPage = flagString(args, "page") ?? "/";
  const base = readServerUrl(runDir);
  const log = (line: string): void => {
    process.stdout.write(`${new Date().toISOString()} ${line}\n`);
  };

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const authPath = runFiles.auth(runDir);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ...(fs.existsSync(authPath) ? { storageState: authPath } : {}),
  });
  context.setDefaultTimeout(15_000);
  const page = await context.newPage();
  await installDeepFind(page);
  const session: Session = {
    runDir,
    base,
    browser,
    context,
    page,
    errors: [],
    console: [],
    requests: [],
    navigations: [],
  };
  page.on("console", (message) => {
    session.console.push({
      at: new Date().toISOString(),
      type: message.type(),
      text: message.text(),
    });
    if (session.console.length > 500) session.console.shift();
    if (message.type() !== "error") return;
    const url = message.location().url;
    // Chrome probes /favicon.ico on its own; the 404 is not the page erroring.
    if (url.endsWith("/favicon.ico")) return;
    session.errors.push(url ? `${message.text()} (${url})` : message.text());
  });
  page.on("pageerror", (error) => session.errors.push(String(error)));
  // CDP is the only place that says who started a document navigation.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.requestWillBeSent", (event) => {
    if (event.type !== "Document") return;
    const initiator = event.initiator;
    session.navigations.push({
      at: new Date().toISOString(),
      url: event.request.url,
      initiator: [initiator.type, initiator.url ?? ""].filter(Boolean).join(" "),
      stack: (initiator.stack?.callFrames ?? [])
        .slice(0, 8)
        .map(
          (frame) =>
            `${frame.functionName || "(anonymous)"} @ ${frame.url}:${frame.lineNumber + 1}`,
        ),
    });
    if (session.navigations.length > 100) session.navigations.shift();
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(base).origin || !isNoteworthyRequest(url.pathname)) return;
    session.requests.push({
      at: new Date().toISOString(),
      method: response.request().method(),
      path: `${url.pathname}${url.search}`,
      status: response.status(),
    });
    if (session.requests.length > 500) session.requests.shift();
  });

  log(`opening ${base}/`);
  await page.goto(`${base}/`);
  log("authorizing with the one-time code from server.log");
  await authorize(page, base, runFiles.serverLog(runDir));
  await context.storageState({ path: authPath });
  log("authorized; token saved to auth.json");
  if (initialPage !== "/") await runBrowserCommand(session, ["goto", initialPage]);

  let queue: Promise<unknown> = Promise.resolve();
  const server = http.createServer((request, response) => {
    const reply = (status: number, body: unknown): void => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.method === "GET" && request.url === "/health") {
      isTrusted(page)
        .then((trusted) => reply(200, { ok: true, port, pageUrl: page.url(), trusted }))
        .catch((error: Error) =>
          reply(200, { ok: false, port, pageUrl: "", trusted: false, error: error.message }),
        );
      return;
    }
    if (request.method === "POST" && request.url === "/shutdown") {
      reply(200, { ok: true });
      log("shutdown requested");
      void shutdown();
      return;
    }
    if (request.method === "POST" && request.url === "/cmd") {
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        let argv: string[];
        try {
          argv = (JSON.parse(body) as { argv: string[] }).argv;
        } catch {
          reply(400, { ok: false, error: "bad request body" });
          return;
        }
        queue = queue
          .catch(() => undefined)
          .then(async () => {
            try {
              const result = await runBrowserCommand(session, argv);
              reply(200, { ok: true, result });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              journal(runDir, `browser ${argv.join(" ")} -> error: ${message.split("\n")[0]}`);
              reply(200, { ok: false, error: message });
            }
          });
      });
      return;
    }
    reply(404, { ok: false, error: "not found" });
  });

  let port = 0;
  const shutdown = async (): Promise<void> => {
    server.close();
    await browser.close().catch(() => undefined);
    log("browser closed");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) port = address.port;
      fs.writeFileSync(runFiles.browserPort(runDir), `${port}\n`);
      log(`daemon listening on 127.0.0.1:${port}`);
      resolve();
    });
  });
}

/* ------------------------------------------------------ browser commands */

function resolveEntryId(entry: string): string {
  return PANEL_ENTRY_IDS[entry] ?? entry;
}

const LOCATOR_FLAGS = ["role", "label", "text", "placeholder", "testid", "selector"];

function hasLocator(args: Args): boolean {
  return LOCATOR_FLAGS.some((flag) => flagString(args, flag) !== undefined);
}

function resolveLocator(page: Page, args: Args): Locator {
  const within = flagString(args, "within");
  const scope = within === undefined ? page : page.locator(within);
  const exact = args.flags.exact === true;
  let locator: Locator;
  const role = flagString(args, "role");
  const label = flagString(args, "label");
  const text = flagString(args, "text");
  const placeholder = flagString(args, "placeholder");
  const testid = flagString(args, "testid");
  const selector = flagString(args, "selector");
  if (role !== undefined) {
    const name = flagString(args, "name");
    locator = scope.getByRole(
      role as Parameters<Page["getByRole"]>[0],
      name === undefined ? {} : { name, exact },
    );
  } else if (label !== undefined) locator = scope.getByLabel(label, { exact });
  else if (text !== undefined) locator = scope.getByText(text, { exact });
  else if (placeholder !== undefined) locator = scope.getByPlaceholder(placeholder, { exact });
  else if (testid !== undefined) locator = scope.getByTestId(testid);
  else if (selector !== undefined) locator = scope.locator(selector);
  else
    throw new Error(
      `a locator is required (${LOCATOR_FLAGS.map((flag) => `--${flag}`).join(", ")})`,
    );
  const hasText = flagString(args, "has-text");
  if (hasText !== undefined) locator = locator.filter({ hasText });
  const nth = flagString(args, "nth");
  if (nth !== undefined) locator = locator.nth(Number(nth));
  return locator;
}

function describeLocator(args: Args): string {
  return Object.entries(args.flags)
    .filter(([key]) =>
      [...LOCATOR_FLAGS, "name", "within", "has-text", "nth", "exact"].includes(key),
    )
    .map(([key, value]) => (value === true ? `--${key}` : `--${key} ${JSON.stringify(value)}`))
    .join(" ");
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function runBrowserCommand(session: Session, argv: string[]): Promise<unknown> {
  const { page, base, runDir } = session;
  const args = parseArgs(argv);
  const subcommand = args.positionals[0];
  const result = await executeBrowserCommand(session, args);
  const saved = saveEvidence(runDir, args, result);
  const summary =
    typeof result === "object" && result !== null && "__raw" in result
      ? "(raw text)"
      : JSON.stringify(result);
  journal(
    runDir,
    `browser ${argv.join(" ")} -> ${summary === undefined ? "ok" : summary.slice(0, 300)}${saved === undefined ? "" : ` (saved ${saved})`}`,
  );
  if (subcommand !== "state" && subcommand !== "console") return result;
  return { ...(result as object), page: page.url().replace(base, "") };
}

async function executeBrowserCommand(session: Session, args: Args): Promise<unknown> {
  const { page, base, runDir } = session;
  const subcommand = args.positionals[0];
  switch (subcommand) {
    case "goto": {
      const target = requirePositional(args, 1, "<path>");
      const url = target.startsWith("http") ? target : `${base}${target}`;
      const response = await page.goto(url, { waitUntil: "load" });
      let trusted = false;
      if (args.flags["no-wait"] !== true) {
        await waitFor(() => isTrusted(page), {
          timeoutMs: 20_000,
          label: "a trusted DevTools client on the page (use --no-wait for pages without the dock)",
        });
        trusted = true;
      }
      return { url: page.url(), status: response?.status(), title: await page.title(), trusted };
    }
    case "panel": {
      const entry = resolveEntryId(requirePositional(args, 1, "<entry>"));
      const ready = flagString(args, "ready") ?? PANEL_READY[entry];
      if (ready === undefined)
        throw new Error(`no default ready selector for ${entry}; pass --ready <css>`);
      await switchPanel(page, entry, ready);
      return { entry, ready, matches: await page.locator(ready).count() };
    }
    case "dock": {
      const title = requirePositional(args, 1, "<title>");
      return openThroughDock(page, title, flagString(args, "group") ?? "Astro");
    }
    case "click":
    case "hover":
    case "focus": {
      const locator = resolveLocator(page, args);
      const force = args.flags.force === true;
      if (subcommand === "click") await locator.click({ force });
      else if (subcommand === "hover") await locator.hover({ force });
      else await locator.focus();
      return { [subcommand]: describeLocator(args), ...(force ? { force } : {}) };
    }
    case "mouse": {
      // Raw pointer input at viewport coordinates: what a user's mouse does,
      // with none of Playwright's target checks. For probing overlays.
      const action = requirePositional(args, 1, "move|click|down|up");
      const x = Number(requirePositional(args, 2, "<x>"));
      const y = Number(requirePositional(args, 3, "<y>"));
      if (action === "move") await page.mouse.move(x, y);
      else if (action === "click") await page.mouse.click(x, y);
      else if (action === "down") {
        await page.mouse.move(x, y);
        await page.mouse.down();
      } else if (action === "up") await page.mouse.up();
      else throw new Error(`unknown mouse action "${action}"`);
      return { mouse: action, x, y };
    }
    case "box": {
      const box = await resolveLocator(page, args).first().boundingBox();
      return box === null
        ? null
        : { ...box, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
    }
    case "fill": {
      const locator = resolveLocator(page, args);
      const value = flagString(args, "value") ?? "";
      await locator.fill(value);
      return { filled: describeLocator(args), value };
    }
    case "select": {
      const locator = resolveLocator(page, args);
      const option = requireFlag(args, "option");
      const selected = await locator.selectOption(option);
      return { selected, locator: describeLocator(args) };
    }
    case "press": {
      const key = requirePositional(args, 1, "<key>");
      if (hasLocator(args)) await resolveLocator(page, args).press(key);
      else await page.keyboard.press(key);
      return { pressed: key };
    }
    case "wait": {
      const timeout = Number(flagString(args, "timeout") ?? 15_000);
      if (hasLocator(args)) {
        const state = (flagString(args, "state") ?? "visible") as
          | "visible"
          | "attached"
          | "hidden"
          | "detached";
        await resolveLocator(page, args).first().waitFor({ state, timeout });
        return { waited: describeLocator(args), state };
      }
      if (args.flags.trusted === true) {
        await waitFor(() => isTrusted(page), {
          timeoutMs: timeout,
          label: "a trusted DevTools client",
        });
        return { waited: "trusted" };
      }
      throw new Error("wait needs a locator (or --trusted)");
    }
    case "text": {
      const texts = (await resolveLocator(page, args).allTextContents()).map(normalizeText);
      return texts;
    }
    case "count":
      return await resolveLocator(page, args).count();
    case "attr": {
      const attribute = requireFlag(args, "attribute");
      const locator = resolveLocator(page, args);
      if (args.flags.all === true) {
        return await locator.evaluateAll(
          (elements, name) => elements.map((element) => element.getAttribute(name)),
          attribute,
        );
      }
      return await locator.first().getAttribute(attribute);
    }
    case "scroll": {
      if (hasLocator(args)) {
        await resolveLocator(page, args).first().scrollIntoViewIfNeeded();
        return { scrolled: describeLocator(args) };
      }
      const where = requirePositional(args, 1, "top|bottom|<locator>");
      await page.evaluate(
        (target) =>
          window.scrollTo(0, target === "top" ? 0 : document.documentElement.scrollHeight),
        where,
      );
      await sleep(250);
      return { scrolled: where, scrollY: await page.evaluate(() => window.scrollY) };
    }
    case "screenshot": {
      const name = requirePositional(args, 1, "<name>");
      const file = evidencePath(runDir, name, ".png");
      await page.screenshot({ path: file, fullPage: args.flags.full === true });
      return { path: file, page: page.url() };
    }
    case "aria": {
      const name = requirePositional(args, 1, "<name>");
      const locator = hasLocator(args) ? resolveLocator(page, args) : page.locator("body");
      const snapshot = await locator.first().ariaSnapshot();
      const file = evidencePath(runDir, name, ".aria.txt");
      fs.writeFileSync(file, `# ${page.url()}\n${snapshot}\n`);
      return { __raw: `${snapshot}\n(saved ${file})` };
    }
    case "rpc": {
      const name = requirePositional(args, 1, "<name>");
      return await rpcCall(page, name);
    }
    case "entries":
      return await dockEntries(page);
    case "navigations": {
      const list = [...session.navigations];
      if (args.flags.clear === true) session.navigations.length = 0;
      return list;
    }
    case "requests": {
      const match = flagString(args, "match");
      const list = session.requests.filter(
        (record) => match === undefined || record.path.includes(match),
      );
      if (args.flags.clear === true) session.requests.length = 0;
      return list;
    }
    case "console": {
      const errors = [...session.errors];
      const match = flagString(args, "match");
      const all = args.flags.all === true || match !== undefined;
      const messages = all
        ? session.console.filter((record) => match === undefined || record.text.includes(match))
        : undefined;
      if (args.flags.clear === true) {
        session.errors.length = 0;
        session.console.length = 0;
      }
      return messages === undefined ? { errors } : { errors, messages };
    }
    case "state":
      return {
        url: page.url(),
        title: await page.title(),
        trusted: await isTrusted(page),
        consoleErrors: session.errors.length,
        requests: session.requests.length,
      };
    case "eval": {
      const expression = requirePositional(args, 1, "<js-expression>");
      return await page.evaluate(expression);
    }
    case "help":
      return { __raw: BROWSER_USAGE };
    default:
      throw new Error(`unknown browser subcommand "${subcommand}"\n${BROWSER_USAGE}`);
  }
}

/**
 * The user path to a panel: the embedded dock's own buttons. The dock is
 * upstream UI (devframes), reached by accessible name; `panel` is the
 * programmatic equivalent through the hub's client API.
 */
async function openThroughDock(page: Page, title: string, group: string): Promise<unknown> {
  const steps: string[] = [];
  if (await wakeDock(page)) steps.push("pointed at the minimized dock to expand it");
  const entryButton = page.getByRole("button", { name: title, exact: true }).first();
  if ((await entryButton.count()) === 0) {
    // Group members show in the sidebar only while their group is open;
    // clicking the group opens it on its default entry.
    const groupButton = page.getByRole("button", { name: group, exact: true }).first();
    await groupButton.click();
    steps.push(`clicked group "${group}"`);
    await entryButton.waitFor({ state: "visible" });
  }
  await entryButton.click();
  steps.push(`clicked "${title}"`);
  return { opened: title, steps };
}

/**
 * After a few idle seconds the embedded dock minimizes to a pill and makes
 * its buttons pointer-transparent; a user expands it again by pointing at
 * the pill, which sits at the dock's anchor. Returns whether it had to.
 */
async function wakeDock(page: Page): Promise<boolean> {
  const anchor = page.locator("#devframes-anchor").first();
  await anchor.waitFor({ state: "attached" });
  const minimized = async (): Promise<boolean> =>
    ((await anchor.getAttribute("class")) ?? "").includes("devframes-minimized");
  if (!(await minimized())) return false;
  // The anchor is a zero-size element, so read its position directly.
  const point = await anchor.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  });
  await page.mouse.move(point.x, point.y);
  await waitFor(async () => !(await minimized()), {
    timeoutMs: 3_000,
    label: "the dock to expand",
  });
  // Let the expand transition finish before measuring buttons.
  await sleep(400);
  return true;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
});
