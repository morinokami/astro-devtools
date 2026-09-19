# Overview panel

Overview is the Astro group's landing panel: it shows the integration's version, the Astro and Vite versions the dev server runs on, live page and action counts, and links that jump to the Routes and Actions panels.

## Sub-features

- `overview-versions` shows `astro-devtools v<version>` under the heading and the Astro and Vite versions as stat cards linking to the projects' sites.
- `overview-counts` shows the number of pages and actions of the project, counted from the running server.
- `overview-jump` opens the Routes panel from the pages card and the Actions panel from the actions card.
- `overview-links` links to the GitHub repository and issue tracker in the footer.

## How to get to it (user POV)

- Click `Astro` in the dock: the group opens on Overview.
- Click `Overview` in the group's sidebar from any other Astro panel.
- Open `/__devtools/`, then the Astro group.
- Agents read the same data through the `astro-devtools_overview_get` MCP tool; [mcp.md](./mcp.md) drives it and its parity with this panel.

## Driving it with drive.ts

Preconditions:

- Baseline; the browser is on `/`.

- **Open it.** Run `drive.ts browser dock Overview` and `drive.ts browser wait --selector '#astro-version'`. The Astro version stat is visible.
- **Versions.** Run `drive.ts browser text --selector '#astro-version'` and `drive.ts browser aria overview --selector devframes-dock-embedded`. The stat reads the installed Astro version as a semver (`v7.3.2` at the time of writing); the snapshot lists `heading "Astro DevTools" [level=1]`, `paragraph: astro-devtools v0.0.1` (the package version), `link "Astro v<version>"` to `https://astro.build` and `link "Vite v<version>"` to `https://vite.dev`.
- **Counts.** In the same snapshot, `button "9 pages"` and `button "5 actions"` match the playground's nine pages (`/`, `/ja`, `/blog/[slug]`, `/client-directives`, `/client-islands-failed`, `/dashboard`, `/frameworks`, `/server-islands`, `/server-islands-failed`) and five actions (`greet`, `feedback.submit`, `survey`, `upload`, `likes.add`).
- **Data behind it.** Run `drive.ts browser rpc astro-devtools:overview:get --save overview-rpc`. The JSON has `astroVersion`, `viteVersion`, `astroDevtoolsVersion`, `nodeVersion`, `output: "static"`, `adapterName: "@astrojs/node"`, `actionsFile: "src/actions/index.ts"`, `middlewareFile: "src/middleware.ts"`, `configFile: "astro.config.mjs"`, `root`, `base`, `trailingSlash`, `buildFormat`, an `i18n` block with locales `en`, `ja`, and `counts: { pages: 9, endpoints: 1, redirects: 1, actions: 5 }`.
- **Jump to Routes.** Run `drive.ts browser click --role button --name "9 pages" --exact` and `drive.ts browser wait --role group --name "Route type filter"`. The Routes panel is open.
- **Jump to Actions.** Run `drive.ts browser dock Overview`, then `drive.ts browser click --role button --name "5 actions" --exact` and `drive.ts browser wait --role button --name greet --exact`. The Actions panel is open. This is the Actions panel's second entry point; `features/actions.md` drives the panel itself.
- **Footer links.** In the `overview` snapshot, `contentinfo` holds `link "Star on GitHub"` to `https://github.com/morinokami/astro-devtools` and `link "Report a Bug"` to its `/issues` page.
- **Proof.** Run `drive.ts browser dock Overview` and `drive.ts browser screenshot overview`.

## Gotchas

- `viteVersion` is the version of `@voidzero-dev/vite-plus-core` (`0.3.2` at the time of writing), not a Vite release number, because this workspace aliases `vite` to that package; the panel reports the installed package faithfully, so a catalog bump changes both version cards.
- The counts are the playground's; adding a page or an action changes them, and so does the Routes/Actions RPC.
- The stat cards for versions are external links (`target="_blank"`); do not click them, read `/url` in the snapshot.
- On the panel's first load the whole stat grid is absent from the DOM (not blank placeholders) and the panel shows `Loading project overview…`; re-opening the panel re-fetches behind the existing grid with a `Refreshing project overview…` note. Wait on `#astro-version` rather than on the panel mounting. A failed first load renders a `role="alert"` `Could not load project overview.` with a `Retry` button; a failed refresh keeps the grid and reads `Could not refresh project overview. Showing previously loaded data.`
