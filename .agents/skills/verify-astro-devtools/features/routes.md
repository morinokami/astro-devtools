# Routes panel

Routes lists every route the dev server resolved, grouped into Pages, Endpoints, Redirects and Internal, with how `astro build` will deliver each one, its source, its i18n variants, and a marker on the route serving the current page; chips and a search box filter the list.

## Sub-features

- `routes-inventory` lists pages, endpoints, redirects and Astro's internal routes with their pattern, delivery badge (`static`, `server`, `dev only`, `needs adapter`) and source file.
- `routes-current` marks the row serving the current page with `current page` and `aria-current="page"`, and moves it on navigation; when a `rewrite` i18n fallback keeps the browser on a fallback URL, the fallback row is the one marked.
- `routes-variants` nests i18n variants and fallback rows (`/ja/...` marked `fallback`) under their primary route; the Pages section carries the caption `i18n fallback routes redirect to the route they are listed under.`
- `routes-redirect` shows a redirect's status and destination (`301 → /blog/hello-world`) under the caption `Served on demand as real 3xx responses; prerendered redirects build meta-refresh pages instead.`
- `routes-chips` filters by section with the `Route type filter` chips, each showing its count; the status then reads `N route(s) shown in <Section>.`, and the `Internal` chip also expands the Internal section.
- `routes-search` filters by text with the `Filter routes` box and announces `N routes shown for the current filter.`, or shows `No routes match the current filter.` when nothing matches.
- `routes-internal` keeps the Internal section collapsed behind an `Internal (N)` toggle; searching expands it.
- `routes-links` links each concrete route to its URL and its source file to the editor.

## How to get to it (user POV)

- Open the Astro group in the dock and click `Routes`.
- Click the `9 pages` card on Overview.
- Open `/__devtools/`, Astro group, `Routes` (no current page there).

## Driving it with drive.ts

Preconditions:

- Baseline; the browser is on `/`.

- **Open it.** Run `drive.ts browser goto /`, `drive.ts browser dock Routes` and `drive.ts browser wait --testid route-row`.
- **Sections and chips.** Run `drive.ts browser aria routes-filter --role group --name "Route type filter"` and `drive.ts browser text --selector 'h2'`. The chips read `All 15` (pressed), `Pages 9`, `Endpoints 1`, `Redirects 1`, `Internal 4`; the headings include `Pages (9)`, `Endpoints (1)`, `Redirects (1)` and `Internal (4)`. Chip and heading counts are primary routes only: the generated i18n fallback rows are excluded, and an empty section gets neither chip nor heading.
- **Rows.** Run `drive.ts browser count --testid route-row` (`19`: the 15 primary routes, minus the 4 Internal rows while that section is collapsed, plus the 8 generated `/ja/…` fallback rows) and `drive.ts browser text --testid route-row --save routes-rows`. `drive.ts browser text --role status` includes `19 routes shown.` Rows read pattern, badges, delivery and source, e.g. `/blog/[slug]staticsrc/pages/blog/[slug].astro`, `/api/hellostaticsrc/pages/api/hello.ts`, `/old-blogstatic301→ /blog/hello-world`, `/ja/blog/[slug]fallback`, and `/dashboard` with `server`.
- **Current page.** Run `drive.ts browser text --testid route-row --has-text "current page"`. Exactly one row, `/current pagestaticsrc/pages/index.astro`. Run `drive.ts browser goto /dashboard`, `drive.ts browser panel routes` and the same command: the row is now `/dashboardcurrent pageserversrc/pages/dashboard.astro`.
- **Chip filter.** Run `drive.ts browser click --role button --name "Endpoints 1" --exact` and `drive.ts browser text --testid route-row`. One row, `/api/hellostaticsrc/pages/api/hello.ts`, and `drive.ts browser text --role status` includes `1 route shown in Endpoints.` Run `drive.ts browser click --role button --name "All 15" --exact` to reset.
- **Search.** Run `drive.ts browser fill --label "Filter routes" --exact --value blog` and `drive.ts browser text --testid route-row`. Three rows: `/blog/[slug]…`, `/ja/blog/[slug]fallback`, `/old-blog…`; `drive.ts browser text --role status` includes `3 routes shown for the current filter.` Run `drive.ts browser fill --label "Filter routes" --exact --value zzz`: `drive.ts browser text --text "No routes match the current filter."` finds the note and the status includes `0 routes shown for the current filter.` Run `drive.ts browser fill --label "Filter routes" --exact --value ""`: the count is `23` because the search expanded Internal.
- **Internal toggle.** Run `drive.ts browser click --role button --name "Internal (4)"` and `drive.ts browser count --testid route-row`. Back to `19`; clicking again returns to `23` and `drive.ts browser text --testid route-row --has-text "astro ("` lists the four internal rows: `/_actions/[...path]serverastro (actions endpoint)`, `/_imageserverastro (image endpoint)`, `/_server-islands/[name]serverastro (server islands)` and `/404dev onlyastro (default 404)` — only the 404 is `dev only`. The `Internal 4` chip (`drive.ts browser click --role button --name "Internal 4" --exact`) filters to those four rows and expands the section on its own: `drive.ts browser count --testid route-row` is `4` and the status includes `4 routes shown in Internal.`; `drive.ts browser click --role button --name "All 15" --exact` returns to `23`.
- **Links.** Run `drive.ts browser attr --selector '[data-testid="route-row"] a' --all --attribute href`. The hrefs are the ten concrete URLs, in DOM order: `/`, `/ja`, `/client-directives`, `/client-islands-failed`, `/dashboard`, `/frameworks`, `/server-islands`, `/server-islands-failed`, `/api/hello`, `/old-blog` — all `target="_blank"`. `/blog/[slug]` and every fallback row have no `pathname`, so they render no anchor. The redirect really redirects: `drive.ts http /old-blog` answers `301` with `location: /blog/hello-world`, and `drive.ts http /api/hello` answers `200` with `{"message":"hello"}`.
- **Proof.** Run `drive.ts browser screenshot routes` and `drive.ts browser aria routes --selector devframes-dock-embedded`.

## Gotchas

- Row text has no separators; match fragments. `route-pattern` is the pattern alone if a clean value is needed.
- Do not click route links (`target="_blank"` opens a tab the harness does not track) or source buttons (editor). Read `href` and `title`.
- The counts are the playground's: 9 pages, 1 endpoint, 1 redirect, 4 internal; adding a page changes chips, headings, totals and the row counts below (each new default-locale page also adds one `/ja/…` fallback row). The panel also has an `Integrations` section for routes injected by integrations; the playground has none, so neither its chip nor its heading renders.
- Clearing the search leaves Internal expanded (23 rows); collapse it with the `Internal (4)` button when a later step expects 19.
- A page load resets the panel's section chip, search text and Internal state; after a `goto` excursion re-open the panel before steps that assume the default filter.
- In `/__devtools/` no row carries `current page`.
- The playground's i18n fallback is `redirect`, so `/ja/dashboard` lands on `/dashboard` and that row is current; only `fallbackType: "rewrite"` keeps the browser on `/ja/dashboard` and marks the `/ja/dashboard` fallback row instead.
