# Config panel

Config shows a read-only summary of the resolved Astro configuration as key/value rows, with a card linking to the project's config file.

## Sub-features

- `config-file` shows the config file card (`astro.config.mjs`) with a button that opens it in the editor.
- `config-rows` lists the resolved values: root, srcDir, publicDir, outDir, site, base, trailingSlash, build.format, output, adapter, integrations (with installed versions), i18n locales, default locale, routing, fallback, security.checkOrigin, devToolbar.enabled.

## How to get to it (user POV)

- Open the Astro group in the dock and click `Config`.
- Open `/__devtools/`, Astro group, `Config` (same content; nothing is page-scoped).

## Driving it with drive.ts

Preconditions:

- Baseline; the browser is on `/`.

- **Open it.** Run `drive.ts browser goto /`, `drive.ts browser dock Config` and `drive.ts browser wait --testid config-row`.
- **File card.** Run `drive.ts browser aria config --selector devframes-dock-embedded`. It shows `heading "Config file"`, `button "astro.config.mjs"` and `heading "Astro config"`.
- **Rows.** Run `drive.ts browser count --testid config-row` (`17`) and `drive.ts browser text --testid config-row --save config-rows`. The rows read key then value, e.g. `outputstatic`, `adapter@astrojs/node`, `base/`, `trailingSlashignore`, `build.formatdirectory`, `i18n.localesen, ja`, `i18n.fallbackja → en (redirect)`, `site(not set)`, and `integrations` including `astro-devtools@<version>` and `playground-extension`. The integrations row lists the adapter first (`@astrojs/node@<version>`), then the renderer integrations (`@astrojs/preact`, `@astrojs/react`, `@astrojs/solid-js`, `@astrojs/svelte`, `@astrojs/vue` and `@astrojs/alpinejs`, each with its version), `playground-extension`, `astro-devtools@<version>` and `astro:actions`, the entry Astro adds because the project has an actions file.
- **Data behind it.** Run `drive.ts browser rpc astro-devtools:config:get --save config-rpc`. `configFile` is `astro.config.mjs`, `root` is the playground's absolute path with a trailing slash, and `entries` holds the same key/value pairs as the rows.
- **Embedded proof.** Run `drive.ts browser screenshot config` before navigating away from the page.
- **Standalone.** Run `drive.ts browser goto /__devtools/`, `drive.ts browser panel config` and `drive.ts browser count --testid config-row`. It is the same `17`: nothing in this panel is page-scoped.
- **Standalone proof.** Run `drive.ts browser screenshot config-standalone`.

## Gotchas

- Row text is key immediately followed by value; match on both parts (`outputstatic`).
- The `astro.config.mjs` button opens the developer's editor; prove its label, never click.
- The integrations row resolves each integration's version by looking its package up from the project root (falling back to the integration's own install), so a dependency bump changes it; the row count stays `17` because the conditional rows `image.domains`, `image.remotePatterns`, `env (keys only)` and `experimental (enabled)` are all at their defaults in the playground and are omitted, while the four `i18n.*` rows appear only because the playground configures i18n.
- This panel is not on the MCP surface (`astro-devtools:config:get` carries no agent metadata); prove it through the page or `browser rpc`, not `mcp call`.
