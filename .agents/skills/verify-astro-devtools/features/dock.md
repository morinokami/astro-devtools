# Dock, authorization and the standalone UI

While `astro dev` runs, every page of the app carries a Vite DevTools dock at the bottom whose Astro group lists the integration's panels; the first use in a browser shows an `Unauthorized` entry instead, and the dev server prints a six-digit code the moment a DevTools client asks for one; the same panels are also reachable in the standalone UI at `/__devtools/`.

## Sub-features

- `dock-mount` mounts the embedded dock on every page next to Astro's own dev toolbar, without console errors.
- `dock-registration` leaves the dock to Vite: the integration only fills its own defaults beneath the project's `vite.devtools` option, so the dock stays off when that option is `false` (or `enabled: false`, or `apply: "build"`), when a manual `DevTools()` plugin already registers Vite DevTools (a warning; the hub runs unbranded, without the access-code line), or when Vite is older than 8.3 (vite-plus-core older than 0.3.2; an error, the MCP endpoint unaffected).
- `dock-auth` treats a new browser as untrusted — the dock bar shows only the logo and an `Unauthorized` entry — until the one-time code is entered (or its magic link opened); the dev server prints the code only when a client asks for one (the auth notice mounting on `/__devtools/`, or the dock's `Unauthorized` entry), never on a plain page load, and the token then persists per origin.
- `dock-minimize` shows the dock as a pill while no panel is open and expands it when pointed at; an open panel keeps it expanded, also across page loads that restore it.
- `dock-group` groups Overview, Islands, Routes, Actions, Config and Docs under an `Astro` entry with the Astro logo and accent color; opening the group lands on Overview.
- `dock-docs` embeds https://docs.astro.build/ behind the `Docs` entry.
- `dock-extension` lets a third-party plugin's entry (`Hello`, from the playground's fixture integration) join the Astro group and render its json-render content.
- `dock-standalone` serves `/__devtools/`, branded Astro DevTools, sharing the authorization; there Islands shows a note instead of rows and Routes marks no current page.

## How to get to it (user POV)

- Open any page of the app at `http://localhost:<port>/` (through `localhost`, not an IP).
- Point at the pill at the bottom of the page, click the Astro logo (`Astro`) in the dock bar, pick an entry in the sidebar.
- In a new browser the bar shows `Unauthorized` instead of the Astro group; open it (or `/__devtools/`) and the terminal prints `[astro-devtools] DevTools access code: 123456 (or open http://localhost:<port>/#devframe_otp=123456)`: type the six digits, or open that link.
- Open `http://localhost:<port>/__devtools/` for the standalone UI.

## Driving it with drive.ts

Preconditions:

- `drive.ts launch` succeeded and `drive.ts doctor` is healthy; the launch already exchanged the newest code from `server.log`.
- The browser is on `/`.

- **Dock mounted.** Load the home page. Run `drive.ts browser goto /` and `drive.ts browser count --selector devframes-dock-embedded`. The count is `1`; `drive.ts browser eval 'Boolean(document.querySelector("astro-dev-toolbar"))'` returns `true`, and `drive.ts browser console` lists no errors.
- **Authorization happened.** Run `drive.ts log --grep 'DevTools access code'` and `drive.ts browser state`. The log holds at least one `[astro-devtools] DevTools access code: <six digits> (or open http://localhost:<port>/#devframe_otp=<code>)` line and the state reports `"trusted": true`.
- **Dock bar.** Snapshot the bar before opening any group — the dock remembers its open entry across page loads, so this is only reproducible as the first dock command of a run. Run `drive.ts browser aria dock-bar --selector devframes-dock-embedded`. It lists `img "Astro DevTools logo"` and the buttons `Astro`, `Vite+`, `Terminals`, `Settings`.
- **Open the Astro group.** Run `drive.ts browser dock Overview`. The result lists the steps `clicked group "Astro"` and `clicked "Overview"`, preceded by `pointed at the minimized dock to expand it` because no panel is open yet (a `goto` that restores an open panel keeps the dock expanded, so later `dock` calls skip that step). Run `drive.ts browser aria dock-open --selector devframes-dock-embedded`: it now lists the sidebar buttons `Overview`, `Islands`, `Routes`, `Actions`, `Config`, `Docs`, `Hello` and the heading `Astro DevTools`.
- **Registry.** Run `drive.ts browser entries --save dock-entries`. The list contains `astro` (type `group`), `astro-devtools:overview`, `astro-devtools:islands`, `astro-devtools:routes`, `astro-devtools:actions`, `astro-devtools:config`, `astro-devtools:docs` (type `iframe`, url `https://docs.astro.build/`) and `playground-extension:hello` with `"groupId": "astro"`.
- **Docs entry.** Run `drive.ts browser dock Docs` and `drive.ts browser attr --selector 'iframe[src^="https://docs.astro.build"]' --attribute src`. The attribute is `https://docs.astro.build/`, and `drive.ts browser navigations` lists the iframe's document load of `https://docs.astro.build/…`.
- **Extension entry.** Run `drive.ts browser dock Hello` and `drive.ts browser text --text "Hello from playground-extension"`. The text is rendered, and `drive.ts browser console` is still empty after opening Docs and leaving it.
- **Proof.** With the group open, run `drive.ts browser screenshot dock-astro-group`.
- **Standalone UI.** Run `drive.ts browser goto /__devtools/` and `drive.ts browser state`. The title is `Astro DevTools` and `trusted` is `true`. Run `drive.ts browser eval 'document.head.querySelector("meta[name=description]").content'`: it returns `DevTools for Astro, built on Vite DevTools`.
- **Standalone panels.** Run `drive.ts browser panel islands` and `drive.ts browser text --text "Islands are page-scoped."`: the note is shown. Run `drive.ts browser panel routes`, `drive.ts browser count --testid route-row` (more than `0`) and `drive.ts browser attr --testid route-row --all --attribute aria-current`: no entry is `page`.
- **Standalone proof.** Run `drive.ts browser panel overview` and `drive.ts browser screenshot standalone-overview`.
- **Untrusted state and on-demand code (last).** Run `drive.ts browser eval 'localStorage.removeItem("__DEVFRAME_CONNECTION_AUTH_TOKEN__"); "removed"'`, `drive.ts browser goto / --no-wait` and `drive.ts browser state`: the state reports `"trusted": false` (the `goto` result says `trusted: false` whenever `--no-wait` skips the check, so only `state` proves it), and `drive.ts browser aria dock-bar-untrusted --selector devframes-dock-embedded` lists only `img "Astro DevTools logo"` and `button "Unauthorized"`. `drive.ts log --grep 'DevTools access code'` shows no new line: a plain page load prints nothing. Run `drive.ts browser goto /__devtools/ --no-wait`, then the same `log` command again: the standalone UI's auth notice asked, so a new `DevTools access code: <code>` line has appeared (repeat the `log` command if it has not landed yet). Run `drive.ts browser goto "/#devframe_otp=<that code>"`: `trusted` is `true` again, the `log` command shows no further line (the exchange rotated the code silently), and `drive.ts browser aria dock-bar-trusted --selector devframes-dock-embedded` lists the `Astro` bar again. `drive.ts browser console` holds the expected `[devframe] Timeout waiting for rpc to be trusted` only if the untrusted page stayed open for 60 s before the exchange (the embedded client's trust timeout); a faster pass leaves it empty. Clear it either way and confirm `drive.ts doctor` is healthy.

## Gotchas

- A minimized dock (no panel open) ignores raw clicks on its buttons; `drive.ts browser dock <Title>` wakes it first. `click --role button --name Astro` on a minimized dock fails with "intercepts pointer events".
- `dock` is verified for Astro-group members and top-level entries (`Terminals`); the `Vite+` group opens differently and is upstream UI.
- The Docs iframe loads an external site; offline, prove the iframe and its `src` only.
- A `goto` restores the selected panel and unmounts the other panels opened on the previous page. Switching panels without navigating keeps them mounted, so scope reads with `--within`.
- The launch has already exchanged a code, so the recipe proves the banner and the trusted state first and drives the untrusted direction last, by removing the stored token through `eval` (the upstream `localStorage` key `__DEVFRAME_CONNECTION_AUTH_TOKEN__`; if upstream renames it, the page simply stays trusted and the step's untrusted checks fail visibly). `playground/e2e/dock.test.ts` covers the same direction with an empty `storageState`.
- A click on the embedded dock's `Unauthorized` entry did not make the server print a code in this harness (the pill's animated badge intercepts the pointer, and `--force` lands on the badge); the standalone UI's notice asks as soon as it mounts, so the recipe uses that.
- The untrusted page logs `Error: [devframe] Timeout waiting for rpc to be trusted` once the embedded client gives up waiting, 60 s after the load; it is the only console error the untrusted step expects, and a pass that re-authorizes sooner never sees it.
- A code expires after five minutes and rotates on every exchange, but only a client asking for one makes the server print it — an exchange rotates silently, and each code is printed once: a client asking again while the printed code is still current adds no line (the auth notice's re-issue button rotates and prints). When re-authorizing by hand, load `/__devtools/` untrusted and take the newest `devframe_otp` in `server.log`.
- The standalone UI never has a current page: Routes shows no `current page` badge and Islands shows a note instead of rows. Islands is the only panel with such a note; Routes simply drops `aria-current`.
- The `Hello` entry comes from `playground/devtools-extension.ts`, a fixture standing in for a third-party extension, not from the package.
- No dock on a page (`drive.ts browser count --selector devframes-dock-embedded` is `0`) means the integration did not inject it — see `dock-registration`. `drive.ts log --grep 'does not register Vite DevTools|DTK0034'` names the old-Vite and manual-plugin cases; a disabled `vite.devtools` is silent. None of the three can be driven here, because the playground's config is fixed and never edited during a run; `packages/astro-devtools/test/setup.test.ts` covers them.
