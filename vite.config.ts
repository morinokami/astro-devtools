import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    sortImports: {
      groups: [
        "type-import",
        ["value-builtin", "value-external"],
        "type-internal",
        "value-internal",
        ["type-parent", "type-sibling", "type-index"],
        ["value-parent", "value-sibling", "value-index"],
        "unknown",
      ],
    },
    sortTailwindcss: {
      // Class order depends on the theme: without one, the custom utilities
      // (`text-muted`, `bg-panel`, …) sort as unknown classes. The sorter
      // therefore loads the panels' Tailwind entry, which imports the
      // @astro-devtools/ui theme, for every package — `packages/ui` included.
      // Keep the path true when that file moves: a stylesheet that does not
      // resolve is no error, it turns class sorting off while the check passes.
      stylesheet: "./packages/astro-devtools/src/client/styles.css",
      functions: ["cn", "cva"],
    },
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
    tasks: {
      inspect: {
        command:
          "vp dlx @modelcontextprotocol/inspector@latest --web --server-url http://localhost:4321/__astro-devtools/__mcp --transport http",
        cache: false,
      },
      // Two passes, because knip leaves circular imports out of its default
      // issue types, and naming `cycles` in knip.jsonc's `include` would
      // replace those defaults: an issue type a later knip adds would then go
      // unchecked. The second pass checks cycles alone, which knip.jsonc makes
      // an error. A task rather than a script, so that this note can stay here.
      knip: {
        command: "knip && knip --cycles",
      },
      "pkg-pr-new": {
        command: "pkg-pr-new publish --pnpm './packages/astro-devtools'",
        cache: false,
      },
    },
  },
});
