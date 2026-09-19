# astro-devtools

Astro integration that embeds Vite DevTools into `astro dev`: an "Astro" dock group of panels plus a read-only MCP endpoint. pnpm workspace: `packages/astro-devtools` (the published package), `packages/ui` (`@astro-devtools/ui`, the private design-system package bundled into it), and `playground` (manual-testing app + e2e suite). Two agent skills live outside the packages: `.agents/skills/verify-astro-devtools` (for maintainers: drives the playground, see below) and `skills/astro-devtools` (for users: installed from GitHub with `npx skills add morinokami/astro-devtools --skill astro-devtools`; keep its tool names and log messages true to `src/rpc.ts` and `src/setup.ts` when those change).

## Commands

Everything runs through Vite+ (`vp`), not npm/pnpm scripts:

```sh
vp install
vp check --fix              # format + lint + typecheck
vp run -r test              # unit tests (Vitest): astro-devtools' test/ mirrors its src/; @astro-devtools/ui has no test/ — its co-located stories run as browser tests
vp run ready                # before committing: the CI lint job + unit tests (build, sync, check, knip, publint, test) — only e2e is left out
vp run playground#e2e       # the CI step ready skips: Playwright e2e (builds the package and installs headless Chromium itself)
vp run @astro-devtools/ui#storybook  # component viewer (Storybook) at http://localhost:6006
```

Manual development: `vp run astro-devtools#dev` (watch build) + `vp run playground#dev`, then open http://localhost:4321 **via localhost**, open the dock, and enter the six-digit code the dev server prints once the dock asks for one. Node-side changes need a dev-server restart; client-side changes only a page reload.

For agent verification in a real dev server, follow the [verify-astro-devtools skill](.agents/skills/verify-astro-devtools/SKILL.md), which manages its own isolated server. When an agent uses `vp run playground#dev` directly, pass `--background` (Vite Task strips the env vars Astro's agent auto-detection reads), read the code via `vp run playground#dev logs`, and stop it with `vp run playground#dev stop`.

## Architecture invariants

- Dev-only: the integration must have no effect outside `astro dev` (including build, sync, and preview).
- Vite registers Vite DevTools, not the integration: `src/setup.ts` only merges the integration's defaults (`apply: "serve"`, `mcp: false`, branding, the access-code banner) beneath the user's `vite.devtools`, and never calls `DevTools()` — a second registration is a DTK0034 crash. This needs Vite ≥ 8.3 (vite-plus-core ≥ 0.3.2); older Vites get an error and no dock.
- One RPC definition, two hosts: RPC functions are defined once in `src/rpc.ts`; the DevTools host (panels) registers them all, the devframe MCP bridge (agents) only those carrying `agent` metadata — shared handlers, so both always answer identically. Every definition is a read-only, JSON-serializable query. The bridge is unauthenticated, so it is served on non-loopback hosts only when `mcp: true` opts in explicitly.
- Single sources of truth: RPC names and payload types in `src/types.ts`, dock ids in `src/dock-ids.ts`, design tokens and shared UI parts in `@astro-devtools/ui` (`packages/ui`: tokens in `src/theme.css`, one Preact component per file).
- Code runs in two places: Node (`src/index.ts`, `setup.ts`, `panels/` — Astro hooks write `store.ts`, RPC handlers read it) and browser (`src/inject.ts` + `src/client*` — Preact panels). Don't mix their imports.

## Conventions

- The doc comment at the top of each file is its spec; read it first and keep it true when editing.
- Order declarations by narrative: main entry point first, then feature groups in processing order, helpers below the code they serve — not by export status or alphabet.
- Panels render one way only: update hooks state → re-render. Style with Tailwind utilities on the shared tokens and `@astro-devtools/ui` components — no new CSS files, no `@apply`, no `dangerouslySetInnerHTML`. List rows need stable data-derived `key`s.

## Gotchas

- Dependency versions live in the pnpm catalogs (`pnpm-workspace.yaml`, strict mode): `dependencies`/`devDependencies` use `catalog:` (`catalog:devtools` for the devtools release train, `workspace:*` for workspace packages); only `peerDependencies` and `inlinedDependencies` carry version literals.
- Toolchain versions are deliberately declared twice: pnpm in `devEngines.packageManager` (what pnpm itself honors) and the legacy `packageManager` field (corepack and other third-party tools); Node in `devEngines.runtime` and `.node-version` (read by CI's setup-vp). Bump each pair in the same commit.
- `@vitejs/devtools` is pre-1.0 (Vite marks its `devtools` option `@experimental`) and pinned exactly in the catalog; the whole `@vitejs/devtools-*` + devframe family lives in the `devtools` named catalog — bump every entry there together (`@devframes/*` peer-pin devframe exactly).
- `@devframes/agentic` is devframe's optional MCP peer: nothing imports it, but the bridge's explicit `mcp` setting makes devframe load it at runtime and throw DF0079 when it is missing — so it is a regular `dependency` (external, not inlined) that exists for that runtime load alone.
- The published package declares `@vitejs/devtools` and `@vitejs/devtools-kit` as peerDependencies (version literals, raised together with the catalog): Vite loads `@vitejs/devtools` from the user's project, so it must not be bundled or pulled in transitively; the kit is type-only (`import type` everywhere, absent from `dist/*.mjs`) and must resolve to the copy the user's `@vitejs/devtools` pins exactly, which a runtime dependency on our own pin would duplicate on every other patch release.
- Inlined dependencies are an explicit contract: a dependency that gets bundled must be listed in both `pack.deps.onlyBundle` (`packages/astro-devtools/vite.config.ts`) and `inlinedDependencies` (its `package.json`), or the build fails. `@astro-devtools/ui` is outside this contract: it is consumed as TypeScript source (its `exports` point into `src/`, so it has no build step) and bundled directly, while its own bundled dependencies must still be listed in both places.
- Cross-package Tailwind wiring: `@astro-devtools/ui`'s `theme.css` starts with `@source "./"`, which registers the package's components with the consuming stylesheet's utility scan — new components there need no extra wiring, but a component whose classes stop rendering usually means this import chain broke. The formatter's class sorter loads the same entry for every package (`fmt.sortTailwindcss.stylesheet`, root `vite.config.ts`): a path that stops resolving disables class sorting silently while `vp check` keeps passing — move the two together.
- `run.cache: true` (root `vite.config.ts`) caches package.json scripts as well as tasks — scripts are uncached by default, tasks are not. A command with side effects the cache cannot replay must therefore be a task with `cache: false` (the one control no flag overrides), never a script: that is why publishing lives in the `pkg-pr-new` task rather than a script. A task and a script may not share a name. Since knip reads scripts and not tasks, a CLI that only a task invokes also needs a knip `ignoreDependencies` entry.
- `playground/vite.config.ts` only defines `vp` tasks — Astro never reads it; the app config is `playground/astro.config.mjs`.
- The published package's `lib` is an allowlist, not a target: `packages/astro-devtools/tsconfig.json` admits ES2025 one group at a time because Node 22 — the oldest Astro 7 runs on — ships only part of ES2025, and `target: "esnext"` emits whatever type-checks: a group added early (say `es2025.promise`) lets `Promise.try` compile and then throw in a user's `astro dev`. The tsconfig comment records each group's Node floor — check it before adding one. Dev-only code (`playground/e2e`, `.agents/`) is bound by the root `engines.node` (`>=22.18`) instead, not by `.node-version`: CI runs it on the pinned Node, but `drive.ts` runs on whatever `node` a maintainer has.
