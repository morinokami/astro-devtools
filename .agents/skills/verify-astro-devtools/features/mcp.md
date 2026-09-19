# MCP endpoint

While `astro dev` runs on a loopback host, the dev server exposes an unauthenticated, read-only MCP endpoint that gives coding agents the same overview, routes and actions data the panels show, discoverable from a connection manifest; it is the dev server's only MCP endpoint.

## Sub-features

- `mcp-discovery` publishes `/__astro-devtools/__connection.json` naming the MCP path (`__mcp`, relative, same origin, no separate port).
- `mcp-tools` lists `astro-devtools_overview_get`, `astro-devtools_routes_list` and `astro-devtools_actions_list`, each marked read-only, and none of the panel-only queries (plus upstream's own read-only `devframe_state_read`).
- `mcp-call` answers a tool call with the running server's data.
- `mcp-parity` returns exactly what the corresponding panel RPC returns, since both share one handler.
- `mcp-gate` stays off on non-loopback hosts unless the integration's own `mcp: true` (`astroDevtools({ mcp: true })`, unrelated to `vite.devtools.mcp`), and off everywhere with `mcp: false`; the decision reads the resolved bind address once the dev server has settled it.
- `mcp-hub-off` keeps the DevTools hub's own aggregate MCP route (`/__devtools/__mcp`) off by defaulting `vite.devtools.mcp` to `false` — a user-set `vite.devtools.mcp` or a manual `DevTools()` plugin in `vite.plugins` turns it back on; the playground does neither — so the bridge is the only MCP surface: `/__devtools/__connection.json` advertises no `mcp`, and that path falls through to the hub's page (`200` HTML on GET, `405` on POST) instead of answering MCP.

## How to get to it (user POV)

- Point an MCP client at `http://localhost:<port>/__astro-devtools/__mcp` (Streamable HTTP).
- Fetch `http://localhost:<port>/__astro-devtools/__connection.json` to discover the path.
- Do not point a client at `/__devtools/__mcp`: that is the hub's aggregate route, which the integration keeps off by default because it would expose every hub tool (terminals included) without authentication.

## Driving it with drive.ts

Preconditions:

- Baseline (`drive.ts doctor` includes the `server.mcp` check).

- **Discovery.** Run `drive.ts http /__astro-devtools/__connection.json --save mcp-connection`. Status `200`; the body has `mcp.path` equal to `__mcp` and no `mcp.port`. Run `drive.ts http /__astro-devtools/__mcp --save mcp-get`: a plain GET answers `405` with the JSON-RPC error `Method not allowed.`, which proves the route is mounted and not origin-gated (a `403` would mean the gate rejected the harness).
- **Tool list.** Run `drive.ts mcp tools --save mcp-tools`. The list contains `astro-devtools_overview_get`, `astro-devtools_routes_list` and `astro-devtools_actions_list`, each with `readOnlyHint: true` and a description ending in `This query is read-only.`; it does not contain `astro-devtools_project_context` or `astro-devtools_config_get` (upstream adds its own `devframe_state_read`, also `readOnlyHint: true`).
- **Call.** Run `drive.ts mcp call astro-devtools_overview_get --save mcp-overview`. `isError` is `false` and `data.astroVersion` is a semver; `drive.ts mcp call astro-devtools_actions_list` lists the five playground actions with `actionsFile: "src/actions/index.ts"`; `drive.ts mcp call astro-devtools_routes_list` has a `context` with `adapterName` and `output` and a non-empty `routes` array.
- **Parity.** Run `drive.ts browser rpc astro-devtools:overview:get --save parity-rpc` and compare with `mcp-overview.json`: the RPC result and the tool's `data` are identical JSON.
- **Hub route off.** Run `drive.ts http /__devtools/__connection.json --save hub-connection`: `200` JSON with `backend`, `websocket`, `sse` and `configs` but no `mcp` key. Run `drive.ts http /__devtools/__mcp --save hub-mcp-get`: `200` with `text/html` (the hub's own page, `<title>Devframes</title>`), not an MCP answer. Run `drive.ts http /__devtools/__mcp --method POST --body '{}' --save hub-mcp-post`: `405` with an empty body.
- **Proof.** The saved JSON files above are the evidence; add `drive.ts log --grep '__astro-devtools'` if the server logged the requests.

## Gotchas

- The handshake is the real Streamable HTTP flow (`initialize`, `notifications/initialized`, protocol version negotiation); the endpoint is stateless and issues no `mcp-session-id`. `drive.ts mcp` performs it, so use it rather than a bare POST.
- `mcp-gate` cannot be driven here: the harness always binds `localhost`. Report it as verified-unreachable, pointing at `playground/e2e/mcp-host.test.ts` — which boots real `astro dev` servers on non-loopback hosts and asserts the endpoint answers `404` — and at the unit tests in `packages/astro-devtools/test/setup.test.ts`. Do not report it as passed.
- The endpoint has no authentication by design; the run's server is loopback-only, so nothing outside this machine can reach it.
- The tool answers are JSON in a text content part; `drive.ts mcp call` parses it into `data`.
