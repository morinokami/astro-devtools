---
name: astro-devtools
description: >-
  Use astro-devtools' read-only MCP endpoint to determine whether routes build
  as static or server-rendered, identify integration-injected routes, and
  inspect Actions and resolved project settings. Also use when installing,
  configuring, or troubleshooting astro-devtools.
---

# astro-devtools

astro-devtools embeds Vite DevTools in `astro dev` and exposes project
metadata over MCP. It is absent from builds, preview, and production.

## Query the running app

Find the actual origin in the dev server's output; `http://localhost:4321`
is only the default. Use `astro dev status` to find a registered server and
reuse it. If none is running, start `astro dev --background` through the
project's package manager or task runner; Astro's project lock prevents
duplicate registered servers. Read background output with `astro dev logs`.

Connect an MCP client to `<origin>/__astro-devtools/__mcp` (Streamable HTTP,
no authentication). These three Astro tools are read-only and take no arguments:

| Need                                                          | Tool                          |
| ------------------------------------------------------------- | ----------------------------- |
| Versions, output, adapter, base, i18n, file paths, counts     | `astro-devtools_overview_get` |
| Resolved routes, sources, matching order, production delivery | `astro-devtools_routes_list`  |
| Action names, input schemas, accept modes, URL settings       | `astro-devtools_actions_list` |

Without an MCP client, POST JSON-RPC directly. This endpoint accepts calls
without an initialize handshake or session id. The Accept header below is
required (406 otherwise); the response is SSE with JSON in its `data:` line.
The tool's answer is JSON encoded inside `result.content[0].text`.

```sh
MCP=http://localhost:4321/__astro-devtools/__mcp
curl -sS "$MCP" -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"astro-devtools_routes_list","arguments":{}}}' \
  | sed -n 's/^data: //p' | jq -r '.result.content[0].text' | jq .
```

Use `tools/list` to inspect available tools if a name is rejected. The
upstream `devframe_state_read` tool contains no Astro project metadata.

MCP does not expose:

- Page islands or hydration state: inspect these in the browser.
- Performance measurements or production metrics: `delivery` describes the
  build's delivery mode, not an observation of the deployed site.
- The full resolved config: for settings absent from overview, inspect
  `astro.config.*` and related code, including integrations and environment
  variables that may affect the values.

## Interpret the results

- Route `delivery` describes the build: `static`, `server`, `dev-only`, or
  `needs-adapter`. Route patterns omit `context.base`; `matchOrder`, not
  array position, gives Astro's matching order.
- If `actionsFile` is present but `actions` is missing, the module could not
  be loaded; this does not mean there are no actions. `[]` means none were
  exported. Missing `accept` or `input` can mean metadata is unavailable.
- In Vite+ projects, `viteVersion` can be the version of
  `@voidzero-dev/vite-plus-core` (`0.3.x`), not the upstream Vite version.

## Call an Action only when requested

MCP lists metadata; invoking an Action runs the project's server code and
may have side effects. Build its path from the returned `segments`, `base`,
and `appendTrailingSlash`, not the display-only `qualifiedName`:

```js
const prefix = (base ?? "/").replace(/\/$/, "");
const name = segments
  .map((segment) => encodeURIComponent(segment).replaceAll(".", "%2E"))
  .join(".");
const path = `${prefix}/_actions/${name}${appendTrailingSlash ? "/" : ""}`;
```

POST JSON for `accept: "json"`, or multipart data for `accept: "form"`.
Form requests need an `Origin` header matching the dev server's origin.
Successful responses use `application/json+devalue`; decode with devalue
rather than treating the parsed array as the Action's return value. An
Action that returns nothing answers `204` with an empty body instead.

## Install and troubleshoot

Install `astro-devtools` and its peer `@vitejs/devtools` as dev dependencies
using the project's package manager (also add the type-only peer
`@vitejs/devtools-kit` if the package manager does not install peers
automatically), then add the integration:

```js
// astro.config.mjs — preserve the project's existing configuration
import { defineConfig } from "astro/config";
import astroDevtools from "astro-devtools";
export default defineConfig({
  integrations: [astroDevtools()],
});
```

Requires Astro 7 and Vite 8.3+ (Vite+ core 0.3.2+). Vite registers DevTools;
do not also add `DevTools()` to `vite.plugins` (duplicate registration,
DTK0034).

- **MCP unavailable:** Check `<origin>/__astro-devtools/__connection.json`.
  A 404 can mean the integration is not running, `mcp: false`, or a
  non-loopback bind address. The unauthenticated endpoint defaults to
  loopback only; set `mcp: true` only when network access is intended.
  Use `/__astro-devtools/__mcp`, not the hub's `/__devtools/__mcp` route.
- **Dock missing:** Check Vite's version and `vite.devtools` settings.
  `inject: false` leaves only the standalone UI at `/__devtools/`;
  `vite.devtools: false` disables the UI but leaves MCP available.
- **Dock asks for a code:** Open the dock, then read the dev log's
  `[astro-devtools] DevTools access code: …` message. This browser
  authorization is separate from MCP, which needs no code.

For additional configuration, see the
[package README](https://github.com/morinokami/astro-devtools/blob/main/packages/astro-devtools/README.md).
