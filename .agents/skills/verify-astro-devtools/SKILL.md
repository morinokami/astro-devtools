---
name: verify-astro-devtools
description: "Launch, drive, and prove astro-devtools — the Astro integration that embeds Vite DevTools into `astro dev` — inside the playground app: the embedded dock on every page, its Astro panels (Overview, Islands, Routes, Actions, Config, Docs), the standalone /__devtools/ UI, and the read-only MCP endpoint. Use it whenever a change under packages/ must be shown working in the real dev server (not just unit tests), when a panel or MCP answer needs screenshot/ARIA/RPC evidence, or when a feature in features/ needs re-proving."
---

# Verify astro-devtools

astro-devtools has no CLI and no production surface (`astro build` is a
no-op by design). Everything a user touches lives in a browser tab of the
playground app (`playground/`, an Astro site that exists for this) while
`astro dev` runs, plus one HTTP surface for coding agents:

- the **embedded dock** (`devframes-dock-embedded`) at the bottom of every
  page, whose **Astro** group holds the Overview, Islands, Routes, Actions,
  Config and Docs panels and the playground's own `Hello` extension entry;
- the **standalone UI** at `/__devtools/` with the same panels;
- the **MCP endpoint** at `/__astro-devtools/__mcp` (discovered through
  `/__astro-devtools/__connection.json`).

The harness is one executable, `.agents/skills/verify-astro-devtools/scripts/drive.ts`.
Every command in this file and in `features/` is written as `drive.ts …`
and is run from the repository root, i.e.
`.agents/skills/verify-astro-devtools/scripts/drive.ts …`. It needs Node
≥ 22.18 (the repo pins 26.5 through Vite+; it runs TypeScript natively) and
`vp` on `PATH`.

## Launch

```sh
drive.ts launch                 # ~5 s when the build cache is warm
drive.ts launch --page /frameworks   # start the browser on another page
```

What it does, in order:

1. `vp run astro-devtools#build` — the playground resolves the package
   through `dist/`, so a launch always builds (cached when unchanged).
2. `vp run playground#e2e-browser` — installs Playwright's headless
   Chromium shell if missing (no-op otherwise).
3. Starts `astro dev --ignore-lock --port 0` for `playground/` as a
   detached process, with its output in `server.log`, and waits for the
   `Local http://localhost:<port>/` line. `--ignore-lock` keeps it out of
   Astro's lock file, so it never collides with a server you or the user
   run by hand.
4. Starts a detached browser daemon: headless Chromium, one page, opened on
   `/`, authorized with the one-time code it reads from that server's own
   log (the same `authorize` helper the e2e suite uses), token saved to
   `auth.json`.

It is ready when it prints a JSON object with `url`, `runDir`,
`evidenceDir` and `browserPort` (build output goes to stderr). Run state
lives in `.verify/<run-id>/` at the repository root — outside the
playground on purpose, so nothing the harness writes lands in the app under
test — and `.verify/current` names the run every other command acts on
(`ASTRO_DEVTOOLS_VERIFY_RUN=<dir>` overrides it). `launch` refuses to start
while the current run is still alive: `drive.ts cleanup` first.

Isolation: a run is fully isolated (random port, no lock file, its own
browser profile and log), so several runs can coexist and a run never
shares state with a dev server it did not start. Pass `--no-prepare` to
skip steps 1–2 when you already ran them.

## Doctor

```sh
drive.ts doctor       # JSON {healthy, checks[]}; exit 1 when unhealthy
```

Read-only. It answers "is this instance worth driving?": the recorded
server pid is alive and is the process listening on the recorded port
(via `lsof`), `/__devtools/` answers 200 with the DevTools app,
`__connection.json` advertises `mcp.path = "__mcp"`, the server log has no
DF8111 warning, `dist/` is not older than `src/` (a warning otherwise), the
browser daemon answers on its port and its page reports a **trusted**
DevTools client. It also reports, as warnings, what it must never drive:
a server registered in Astro's lock file (`astro dev status`), whatever
holds port 4321, and other live run directories. Run it before the first
drive, after any failed drive, and whenever a command times out.

## Drive

Two kinds of commands.

**Browser** — `drive.ts browser <subcommand>` talks to the one persistent
page (the page stays where the previous command left it; every command
also appends to `evidence/journal.log`):

| Need                             | Command                                                                                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open a page                      | `drive.ts browser goto /frameworks` (waits for a trusted DevTools client; add `--no-wait` for pages without the dock, e.g. `/api/hello`)                                                                             |
| Open a panel the way a user does | `drive.ts browser dock Routes` — expands the minimized dock, clicks the **Astro** group, then the `Routes` sidebar button (`--group "Vite+"` for another group; top-level entries like `Terminals` need no group)    |
| Open a panel programmatically    | `drive.ts browser panel routes` — `overview\|islands\|routes\|actions\|config\|docs` or a full id such as `playground-extension:hello --ready 'text=Hello from playground-extension'`; waits for the panel's content |
| Act                              | `click`, `hover`, `focus`, `fill --value`, `select --option`, `press <key>`, `scroll top\|bottom`, each with a locator; `mouse move\|click\|down\|up <x> <y>` for raw pointer input                                  |
| Settle before reading            | `wait <locator> [--state visible\|attached\|hidden\|detached] [--timeout <ms>]` — how every recipe waits for a panel's content to land                                                                               |
| Read                             | `text`, `count`, `attr --attribute <name> [--all]`, `aria <name>`, `screenshot <name>`, `rpc <name>`, `entries`, `requests [--match]`, `console [--all]`, `navigations`, `state`, `box`                              |
| Last resort                      | `eval '<js>'`                                                                                                                                                                                                        |

Locators, in order of preference: `--role <role> --name <text> --exact`,
`--label <text> --exact`, `--text <text>`, `--placeholder`, `--testid <id>`
(`data-testid`), `--selector <css>` (Playwright CSS, pierces open shadow
roots). Narrow with `--within <css>`, `--has-text <text>`, `--nth <i>`.
Locators are strict: a click or fill on a locator that matches several
elements fails with the candidates listed — that is the moment to add
`--exact` or `--within`. Within the same page, the dock keeps every panel
it has opened mounted, so when two panels share wording, scope with `--within`.

The panels' stable handles: `#astro-version` (Overview),
`[data-testid="island-row"]`, `[data-testid="island-framework"]`,
`[data-testid="server-island-row"]`, `[data-testid="server-islands-note"]`
(Islands), `[data-testid="route-row"]`, `[data-testid="route-pattern"]`,
the `Route type filter` group and the `Filter routes` search box (Routes),
`button[aria-expanded][title="<action>"]` rows, `Call action` buttons and
`[data-testid="call-result"]` (Actions), `[data-testid="config-row"]`
(Config). The dock's own buttons are reached by accessible name: `Astro`,
`Vite+`, `Terminals`, `Settings`, and inside the open Astro group
`Overview`, `Islands`, `Routes`, `Actions`, `Config`, `Docs`, `Hello`.

**HTTP** — no browser involved:

```sh
drive.ts http /api/hello                # status, content-type, location, body
drive.ts mcp tools                      # tools/list through the real Streamable HTTP handshake
drive.ts mcp call astro-devtools_routes_info --save routes-mcp
drive.ts log --grep '_actions'          # the dev server's own output, ANSI stripped
drive.ts url                            # the base URL, for curl
```

## Evidence

Everything lands in `.verify/<run-id>/evidence/` (printed as
`evidenceDir` by `launch`): `<name>.png` from `screenshot`, `<name>.aria.txt`
from `aria`, `<name>.json` from any read command given `--save <name>`,
and `journal.log`, the timestamped list of every browser command with its
result. The run directory also keeps `server.log` (Astro's output, i.e. the
server-side record of every request and error) and `browser.log`.

Standards for a proof:

- Exercise the real user path: reach a panel through `dock` at least once
  per run, fill forms through their controls, call actions with their
  `Call action` button. `panel` and `rpc` are shortcuts for reaching a
  state quickly, not substitutes for the user path.
- Capture the action and the resulting state, not only the final screen:
  an `aria`/`screenshot` after the action, plus the text that changed.
- Verify side effects where the feature has them: an action call must show
  up as `POST /_actions/<name>/ <status>` in `drive.ts log --grep _actions`
  and in `browser requests --match /_actions/`; a server island as
  `/_server-islands/...` requests; a failed island as a `[ERROR]` line.
- `browser console` must be empty at the end of a drive unless the feature
  file says which error is expected. Those are the server-island fixture's
  500, the client-island fixture's `[astro-island] Error hydrating …`, and
  the Actions recipe's two deliberate `400`s. Inspect expected errors, then
  clear them with `browser console --clear`. (Opening the Docs iframe used
  to log an upstream `SecurityError`; devframe 0.9.18 swallows it.)
- Nothing here is mocked. The external boundaries are the Docs panel,
  which is an iframe of https://docs.astro.build/ — prove the iframe and
  its `src`, not the site — and the dock's icons, which the upstream UI
  fetches from api.iconify.design: offline or rate-limited, every icon logs
  a console error naming that host. That is environmental noise (the e2e
  suite stubs the host); recognise it and clear it, don't count it against
  the integration.
- The MCP surface and the panels share one handler per query, so parity
  is a legitimate proof: `browser rpc astro-devtools:overview:info` and
  `mcp call astro-devtools_overview_info` must return the same data.

## Cleanup

```sh
drive.ts cleanup                 # the current run
drive.ts cleanup --run .verify/<run-id>   # a specific (e.g. stale) run
drive.ts runs                    # every run directory, alive or not
```

Cleanup stops only the pids it recorded (the browser daemon and its
Chromium, then the dev server, SIGTERM then SIGKILL, by process group) —
never anything by name — and deletes the scratch state (`server.pid`,
`browser.pid`, `browser.port`, `auth.json`, the `current` pointer). It keeps
`evidence/`, `server.log` and `browser.log`; check `ls
.verify/<run-id>/evidence` afterwards. Run it after every failed attempt
too, so no server or browser outlives the drive.

## Helpers

- `scripts/drive.ts` — executable; `drive.ts help` and `drive.ts browser
help` print every command. Internally it reuses
  `playground/e2e/support/helpers.ts` (`authorize`, `switchPanel`,
  `rpcCall`, …), so the harness and the e2e suite obtain a trusted DevTools
  client the same way.
- `tsconfig.json` — type context so `vp check` can lint `drive.ts` with
  Playwright and Node types; nothing at runtime reads it.

## Feature map

`features/README.md` indexes one file per user-facing feature with its
entry points, the exact drive commands, and the observable end state. A
proof is complete only when it covers the entry points the feature file
lists.

## Gotchas

- **Foreign servers.** A dev server you did not launch may already be
  running (at the time of writing, an orphaned `astro dev --json` from a
  previous agent session held port 4321). `doctor` lists it as a warning;
  never drive or stop it — the run has its own server on its own port.
- **Access codes print on demand.** The server prints a code only when a
  DevTools client asks for one — the auth notice mounting on `/__devtools/`,
  which is why `launch` visits it first — never on a plain page load, and
  an exchange rotates the code silently. `features/dock.md` drives the
  untrusted direction as its last step.
- **`--exact` matters.** `--label name` also matches the `name value`
  select beside the input; `--role textbox --name name --exact` does not.
- **Do not click source links.** Every file path rendered as a button
  (`src/actions/index.ts`, island paths, route sources) POSTs to
  `/__open-in-editor` and opens the developer's editor on this machine.
  Prove them by their `title`/text instead.
- **Do not click route links.** Route patterns are `target="_blank"`
  anchors; a click opens a tab the harness does not track. Read `href`.
- **The dock restores its selected panel after navigation.** The selection
  lives in `sessionStorage` (`devframes-dock-session`). A `goto` restores
  that panel; other panels opened on the previous page are unmounted.
  Snapshot the bare dock bar before opening anything, and scope reads with
  `--within` when switching panels within the same page.
- **The dock is a pill whenever no panel is open** — right after a page
  load with nothing to restore, in particular — and its buttons then ignore
  the pointer; while a panel is open it stays expanded, also across a `goto`
  that restores that panel. `dock` wakes the pill (pointer on
  `#devframes-anchor`); raw `mouse`/`click` on dock buttons without that
  step fail with "intercepts pointer events".
- **`--role status` matches every mounted panel's live region.** Panels
  stay mounted within a page, so `text --role status` returns a list; look
  for the sentence you expect in it (or scope with `--within`).
- **The page also carries Astro's own dev toolbar** (`astro-dev-toolbar`,
  with headings such as `Audit`), so generic selectors like `h1` hit both;
  prefer roles with names.
- **Any change to the package needs `cleanup` + `launch`** (Node-side code
  needs a server restart; `launch` rebuilds anyway).
- **Do not write files into `playground/` during a run.** Vite watches
  that tree, and while a route is in an error state Astro reloads the
  page on any watched-file change. The harness keeps everything under
  `.verify/` at the repo root for this reason; `browser navigations`
  shows every document load with its initiator if a page reloads
  unexpectedly.
- **`viteVersion` is not a Vite release number** in Overview and MCP
  answers: `vite` is aliased to `@voidzero-dev/vite-plus-core` in this
  workspace, so the integration reports that package's version (`0.3.2` at
  the time of writing; a catalog bump changes it, and the integration's
  Vite gate refuses anything below 0.3.2 — see the next gotcha). Not a bug
  in the panel.
- **No dock at all means the integration chose not to inject it.** Vite
  DevTools is registered by Vite from the `devtools` option (Vite ≥ 8.3,
  vite-plus-core ≥ 0.3.2), never by the integration, and three project
  configurations leave the dock off: `vite.devtools: false` (or
  `enabled: false`, or `apply: "build"`), silently; a manual `DevTools()`
  in `vite.plugins`, which keeps Vite DevTools running unbranded with a
  warning; or a Vite below the minimum, with an error (the MCP endpoint
  stays up). `drive.ts log --grep 'does not register Vite DevTools|DTK0034'`
  names the last two. None of them can be driven here — the playground's
  config is fixed and never edited during a run;
  `packages/astro-devtools/test/setup.test.ts` covers them.
- **The MCP loopback gate** (`--host` disables the endpoint unless the
  integration's own `mcp: true` — `astroDevtools({ mcp: true })`, not
  `vite.devtools.mcp`, which switches the hub's aggregate route instead)
  cannot be driven by this harness, which always binds localhost. It is
  covered by `playground/e2e/mcp-host.test.ts`, which boots real dev
  servers on non-loopback hosts, and by unit tests in
  `packages/astro-devtools/test/setup.test.ts`.
