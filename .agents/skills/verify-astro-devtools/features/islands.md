# Islands panel

Islands lists the islands of the page the dock is embedded in: client islands with their directive (including its argument), hydration state, framework logo, source file and props, and server islands with their request method and load state; hovering a client row highlights the island on the page.

## Sub-features

- `islands-client` lists each `astro-island` with its component name, `client:*` directive, `hydrated`/`failed`/`pending` badge, source path and props summary.
- `islands-directive-args` renders the directive's argument in attribute syntax: `client:only="preact"`, `client:media="(max-width: 50em)"`, `client:idle={{"timeout":500}}`; a bare directive stays `client:load`.
- `islands-hydration` flips a `client:visible` island from `pending` to `hydrated` once it scrolls into view.
- `islands-failed` marks a client island whose hydration threw as `failed`; the failure is recorded at page load, so it still shows when the panel is opened afterwards.
- `islands-announcer` announces `X of Y client islands hydrated. N failed. X of Y server islands loaded.` in a `role="status"` region; on a page without islands it announces `No islands detected on this page.`
- `islands-highlight` draws a highlight box over the island while its row is hovered or focused, and hides it on leave (the box stays in the page with `display: none`).
- `islands-frameworks` labels each island with its renderer's logo (Preact, React, SolidJS, Svelte, Vue), including `client:only` islands.
- `islands-server` counts server islands, folds loaded ones into `All loaded.` and lists pending or failed ones as rows with `GET`/`POST` and their state.
- `islands-empty` shows `No islands on this page.` on a page without islands, with a `Learn about islands` link to the Astro docs.
- `islands-standalone` shows `Islands are page-scoped.` in `/__devtools/`, with the same `Learn about islands` link.

## How to get to it (user POV)

- Open a page with islands (`/`, `/client-directives`, `/client-islands-failed`, `/frameworks`, `/server-islands`, `/server-islands-failed`), open the Astro group in the dock, click `Islands`.
- Hover a row to see the island highlighted on the page; click its file path to open the component in the editor.

## Driving it with drive.ts

Preconditions:

- Baseline; the browser is on `/` (two client islands: a `client:load` counter and a `client:visible` greeting below the fold).

- **Open it.** Run `drive.ts browser goto /`, `drive.ts browser dock Islands` and `drive.ts browser wait --testid island-row`. Rows are visible.
- **Client rows.** Run `drive.ts browser text --testid island-row`. Two rows: `<PreactCounter>client:loadhydratedsrc/components/preact/PreactCounter.tsxprops: {"start":5}` and `<Greeting>client:visiblependingsrc/components/preact/Greeting.tsx`; `drive.ts browser text --selector 'h2' --has-text "client island"` reads `2 client islands on this page`, and `drive.ts browser text --role status` includes `1 of 2 client islands hydrated.`
- **Source path.** Run `drive.ts browser attr --selector '[data-testid="island-row"] button' --all --attribute title`. The titles are the component paths (`src/components/preact/PreactCounter.tsx`, `src/components/preact/Greeting.tsx`). Do not click them.
- **Highlight.** Run `drive.ts browser hover --testid island-row --nth 0` and `drive.ts browser eval 'getComputedStyle(document.querySelector("astro-devtools-highlight")).display'`. It returns `block`; `drive.ts browser screenshot islands-highlight` shows the box around the counter. Run `drive.ts browser hover --role heading --name "astro-devtools playground"` and the same `eval`: it returns `none`.
- **Hydration.** Run `drive.ts browser scroll bottom` and `drive.ts browser wait --testid island-row --has-text hydrated --nth 1`. `drive.ts browser text --testid island-row` now shows both rows `hydrated`, and `drive.ts browser text --role status` includes `2 of 2 client islands hydrated.`
- **Directive arguments.** Run `drive.ts browser goto /client-directives`, `drive.ts browser panel islands` and `drive.ts browser count --testid island-row` (`5`). `drive.ts browser text --testid island-row` shows five rows whose badges read, in order, `client:load`, `client:idle={{"timeout":500}}`, `client:media="(max-width: 50em)"` (still `pending`), `client:only="preact"` and `client:visible={{"rootMargin":"200px"}}` — the first four are `<PreactCounter>` rows carrying `props: {"start":1}` … `{"start":4}`, the last is the props-less `<Greeting>`. Run `drive.ts browser screenshot islands-directives`.
- **Client hydration failure.** Run `drive.ts browser console --clear`, `drive.ts browser goto /client-islands-failed`, `drive.ts browser panel islands` and `drive.ts browser wait --testid island-row --has-text failed`. `drive.ts browser text --testid island-row` is three rows: `<ThrowingIsland>client:loadfailedsrc/components/preact/ThrowingIsland.tsx`, `<PreactCounter>client:loadhydratedsrc/components/preact/PreactCounter.tsxprops: {"start":5}` and `<Greeting>client:visiblependingsrc/components/preact/Greeting.tsx`; `drive.ts browser text --selector 'h2' --has-text "client island"` reads `3 client islands on this page`. `drive.ts browser console` lists the expected `[astro-island] Error hydrating /src/components/preact/ThrowingIsland.tsx Error: This client island fails on purpose.` (followed by its stack), and `drive.ts log --grep 'This client island fails on purpose'` shows Vite forwarding that same message into `server.log` as `[ERROR] [vite] [console.error]`. Run `drive.ts browser screenshot islands-client-failed`.
- **Frameworks.** Run `drive.ts browser goto /frameworks`, `drive.ts browser panel islands`, `drive.ts browser count --testid island-row` (`6`) and `drive.ts browser attr --testid island-framework --all --attribute aria-label`. The labels are `Preact`, `React`, `SolidJS`, `Svelte`, `Vue`, `Preact`; the last row is the `client:only="preact"` counter. The Alpine widget on the page has no row.
- **Server islands, healthy.** Run `drive.ts browser goto /server-islands`, `drive.ts browser panel islands` and `drive.ts browser wait --testid server-islands-note --has-text "All loaded."`. `drive.ts browser text --selector 'h2'` includes `3 server islands on this page` and `1 client island on this page`; `drive.ts browser requests --match /_server-islands/` lists two `GET` and one `POST` to `/_server-islands/DelayedMessage` with status `200`, matched by `drive.ts log --grep '_server-islands/DelayedMessage'`.
- **Server islands, failed.** Run `drive.ts browser goto /server-islands-failed`, `drive.ts browser panel islands` and `drive.ts browser wait --testid server-island-row --has-text "failed · 500"`. `drive.ts browser text --testid server-island-row` is `<ThrowingComponent>GETfailed · 500`; `drive.ts browser wait --testid server-islands-note --has-text "1 more loaded."` passes; `drive.ts log --grep 'This component fails on purpose'` shows the `[ERROR]` line; `drive.ts browser console` lists the expected `500` for `/_server-islands/ThrowingComponent`. Run `drive.ts browser screenshot islands-failed`.
- **Empty state.** Run `drive.ts browser goto /dashboard`, `drive.ts browser panel islands` and `drive.ts browser text --text "No islands on this page."`. The note is shown; `drive.ts browser text --role status` includes `No islands detected on this page.`, and `drive.ts browser aria islands-empty --selector devframes-dock-embedded` lists `link "Learn about islands"` with `/url: https://docs.astro.build/en/concepts/islands/` (external; read it, do not click).
- **Standalone note.** Run `drive.ts browser goto /__devtools/`, `drive.ts browser panel islands` and `drive.ts browser text --text "Islands are page-scoped."`. The same `Learn about islands` link sits under the note.

## Gotchas

- Row text joins the name, directive badge, state badge, path and props without separators; match on fragments (`hydrated`, `client:visible`). The directive badge carries its argument, so `client:only` and `client:media` rows match as `client:only="preact"` and `client:media="(max-width: 50em)"`.
- The file-path buttons open the developer's editor through `/__open-in-editor`; prove the `title`, never click.
- The highlight lives in the page document, outside the dock; hovering with the pointer, not focus, is the user path. Generic `h1` hover fails strict mode because Astro's toolbar has its own headings; use the role and name above.
- The failed server island's row starts as `pending` and turns `failed · 500` once the response lands; wait for the text, not for a row count.
- A failed _client_ island retains its `ssr` attribute, so that attribute cannot distinguish `pending` from `failed`; wait on the text `failed`. Opening the panel after hydration fails still shows the failure.
- `client:media="(max-width: 50em)"` never hydrates in a drive: the harness browser is fixed at 1280×800 and has no resize command. Its `pending` state is expected, not a stall. `client:idle` may already be `hydrated` by the time the panel opens, so do not assert `pending` on it.
- Two fixtures fail on purpose, and each has its own expected errors. `/server-islands-failed` logs an `[ERROR] Error: This component fails on purpose.` stack in `server.log` and a `500` console error for `/_server-islands/ThrowingComponent`. `/client-islands-failed` logs the browser console error `[astro-island] Error hydrating …ThrowingIsland.tsx Error: This client island fails on purpose.`, which Vite also forwards into `server.log` as `[ERROR] [vite] [console.error]`. Expect these on those two pages and nowhere else.
- Both fixture messages contain "fails on purpose", so `--grep 'fails on purpose'` matches both fixtures' logs when both have run; grep the distinguishing half (`This client island fails on purpose` / `This component fails on purpose`).
- The `/server-islands-failed` page can reload itself once shortly after load while its error is fresh (`drive.ts browser navigations` shows the loads); waiting on the row tolerates that.
