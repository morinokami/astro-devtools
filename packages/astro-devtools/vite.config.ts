import tailwindcss from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import postcss from "postcss";
import { defineConfig } from "vite-plus";

/**
 * Compile Tailwind CSS into a JavaScript string for panel shadow roots.
 * The virtual ID keeps tsdown's CSS parser from processing Tailwind's
 * extended import syntax before PostCSS.
 */
const VIRTUAL_CSS_PREFIX = "\0tailwind-inline:";
// A `.css` suffix would make tsdown's CSS plugin process the virtual module.
const VIRTUAL_CSS_SUFFIX = ".js";

const tailwindInline = {
  name: "tailwind-inline",
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith(".css") || importer === undefined) return null;
    return VIRTUAL_CSS_PREFIX + resolve(dirname(importer), source) + VIRTUAL_CSS_SUFFIX;
  },
  async load(this: { addWatchFile: (id: string) => void }, id: string) {
    if (!id.startsWith(VIRTUAL_CSS_PREFIX)) return null;
    const file = id.slice(VIRTUAL_CSS_PREFIX.length, -VIRTUAL_CSS_SUFFIX.length);
    const source = await readFile(file, "utf8");
    const result = await postcss([tailwindcss({ optimize: { minify: true } })]).process(source, {
      from: file,
    });
    // The module id is virtual, so a watch build cannot infer what was read
    // to produce it: without this, editing a stylesheet rebuilds nothing and
    // the change only lands on the next rebuild some other file triggers.
    // Tailwind reports what it pulled in — the `@import`ed theme and the
    // `@source` trees it scans for utilities — as PostCSS dependencies.
    this.addWatchFile(file);
    for (const message of result.messages) {
      const dependency = message.type === "dependency" ? message.file : message.dir;
      if (typeof dependency === "string") this.addWatchFile(dependency);
    }
    return { code: `export default ${JSON.stringify(result.css)};`, moduleType: "js" as const };
  },
};

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/inject.ts", "src/client.ts", "src/kit.ts"],
    plugins: [tailwindInline],
    // class-variance-authority imports clsx by name; cn provides the same
    // named export, so keep one class-name implementation in the bundle.
    alias: { clsx: "cn" },
    deps: {
      // The complete set of dependencies expected in the bundle; a
      // dependency that would be inlined without appearing here fails the
      // build instead of being shipped unnoticed.
      onlyBundle: [
        "@jridgewell/sourcemap-codec",
        "class-variance-authority",
        "cn",
        "devalue",
        "es-module-lexer",
        "magic-string",
        "preact",
      ],
    },
    dts: true,
    exports: true,
  },
  run: {
    tasks: {
      dev: {
        command: "vp pack --watch",
        // A watch build runs until killed; its output must never be
        // replayed from the cache as if it were a finished build.
        cache: false,
      },
    },
  },
});
