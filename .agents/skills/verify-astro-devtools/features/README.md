# astro-devtools verification map

This directory is the maintained source for verifying the user-facing behavior of astro-devtools inside the playground's `astro dev`. Read the index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `drive.ts launch` from the repository root and keep the JSON it prints: `url` is the dev server, `evidenceDir` is where proof goes.
- `drive.ts` in every command below stands for `.agents/skills/verify-astro-devtools/scripts/drive.ts`, run from the repository root.
- `drive.ts doctor` reports `"healthy": true`, including `browser.trusted`.
- The browser sits on `/` of the run's own server; the launch authorized it with that server's one-time code.
- Never drive a dev server this run did not start (doctor lists foreign ones as warnings).

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise; `drive.ts browser goto /` returns to it.
- Reach a panel through the dock at least once per run (`drive.ts browser dock <Title>`); `drive.ts browser panel <name>` is the programmatic shortcut for later steps.
- Prefer ARIA roles and accessible names (`--role … --name … --exact`) over CSS; `data-testid` hooks are the stable fallback.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Read the dev server through `drive.ts log --grep <regex>` and the MCP endpoint through `drive.ts mcp …`.
- Nothing in these recipes edits the playground; do not write files into `playground/` while a run is up.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen: `drive.ts browser aria <name>` and `drive.ts browser screenshot <name>` after the action, plus the changed text.
- Panel proof includes the panel's ARIA snapshot (scoped with `--selector devframes-dock-embedded`) and a screenshot with the page and dock visible.
- Server-side proof includes the matching `server.log` lines (`drive.ts log --grep …`) and, for browser-initiated calls, `drive.ts browser requests --match …`.
- HTTP and MCP proof includes the command and its JSON output saved with `--save <name>`.
- `drive.ts browser console` must be empty at the end of a recipe unless the recipe names the expected error.
- Record the feature ID and entry point used with every artifact (the journal in `evidence/journal.log` records every browser command automatically).
- Report an unreachable path with the attempted command and the unmet precondition. Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with drive.ts` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Dock, authorization and the standalone UI](./dock.md) covers the embedded dock on every page, the one-time-code authorization, the Astro group and its entries (including the Docs iframe and the playground's `Hello` extension), and `/__devtools/`.
- [Overview panel](./overview.md) covers versions, project stats, and the stat cards that open the Routes and Actions panels.
- [Islands panel](./islands.md) covers client islands with hydration state, hover highlighting, framework logos, server islands (loaded and failed), and the empty and standalone states.
- [Routes panel](./routes.md) covers the route inventory, delivery badges, the current-page marking, section chips, text filtering, and the collapsible Internal section.
- [Actions panel](./actions.md) covers the actions list, the generated forms, JSON and form-data calls against the live `/_actions/` endpoint, schema errors, the panel-side `invalid input` refusal, and the documented `File` limitation.
- [Config panel](./config.md) covers the resolved-config summary rows and the config-file card.
- [MCP endpoint](./mcp.md) covers connection discovery, the tool list, tool calls, parity with the panels, and the hub's own MCP route staying off.
