import type { SourceMap } from "magic-string";
import type { Plugin } from "vite";

import { init, parse } from "es-module-lexer";
import MagicString from "magic-string";

/** Symbol key used to store metadata on an action handler. */
export const ACTION_METADATA_KEY = "astro-devtools:action-metadata";

/** The specifier project code uses to import Astro's actions module. */
const ASTRO_ACTIONS_ID = "astro:actions";

/**
 * Redirect `astro:actions` to the metadata wrapper in every server module,
 * so `defineAction` attaches metadata no matter which file defines the
 * action — the actions entry or any helper module it imports. The app and
 * the Actions panel then share one module instance, and module-level code
 * never runs a second time for the panel.
 *
 * Astro's own plugin resolves `astro:actions` with `enforce: "pre"`, ahead
 * of anything this plugin could return from `resolveId`, which is why the
 * redirect rewrites import specifiers during `transform` instead.
 */
export function actionsMetadataPlugin(): Plugin {
  return {
    name: "astro-devtools:actions-metadata",
    // The wrapper must never reach a production build.
    apply: "serve",
    resolveId(id) {
      if (id === WRAPPER_MODULE_ID) return RESOLVED_WRAPPER_MODULE_ID;
      return undefined;
    },
    load(id) {
      if (id === RESOLVED_WRAPPER_MODULE_ID) return WRAPPER_MODULE_SOURCE;
      return undefined;
    },
    async transform(code, id, options) {
      // Only server modules can define actions, and the client copy of
      // `astro:actions` has different exports. Virtual modules (`\0`) stay
      // untouched so the wrapper itself keeps importing the real module.
      if (!options?.ssr || id.startsWith("\0")) return undefined;
      if (!code.includes(ASTRO_ACTIONS_ID)) return undefined;
      return await rewriteActionsImports(code);
    },
  };
}

/**
 * Redirect `astro:actions` import specifiers to the wrapper module.
 * es-module-lexer reports real import statements only, so identical text in
 * strings, comments, or regular expressions is never touched, and the
 * MagicString edit produces a sourcemap so positions stay accurate for
 * debugging. The input is compiled JavaScript, so static imports,
 * re-exports, and dynamic imports are all handled; sources that the lexer
 * cannot parse (`.astro` or framework files not yet compiled by an earlier
 * plugin) are served unchanged — actions cannot be defined there.
 */
export async function rewriteActionsImports(
  code: string,
): Promise<{ code: string; map: SourceMap } | undefined> {
  await init();
  const imports = parseImports(code);
  if (imports === undefined) return undefined;
  let result: MagicString | undefined;
  for (const { type, specifier, start, end } of imports) {
    if (specifier !== ASTRO_ACTIONS_ID) continue;
    result ??= new MagicString(code);
    // A dynamic import's specifier range includes the quotes; a static
    // import's or re-export's does not.
    result.overwrite(
      start,
      end,
      type === "dynamic" ? JSON.stringify(WRAPPER_MODULE_ID) : WRAPPER_MODULE_ID,
    );
  }
  if (result === undefined) return undefined;
  return { code: result.toString(), map: result.generateMap({ hires: true }) };
}

function parseImports(code: string): ReturnType<typeof parse>[0] | undefined {
  try {
    return parse(code)[0];
  } catch {
    return undefined;
  }
}

const WRAPPER_MODULE_ID = "astro-devtools:actions-metadata-module";
const RESOLVED_WRAPPER_MODULE_ID = `\0${WRAPPER_MODULE_ID}`;

/**
 * Re-export `astro:actions`, but wrap `defineAction` so each returned handler
 * keeps the options needed by the call form. The wrapper sits in the app's
 * dev module graph, so every failure mode degrades to missing metadata
 * instead of a changed action: types without a JSON Schema equivalent become
 * `{}`, and a handler that rejects new properties keeps working, just
 * without metadata.
 */
const WRAPPER_MODULE_SOURCE = `
export * from "astro:actions";
import { defineAction as realDefineAction } from "astro:actions";
import { z } from "astro/zod";

export function defineAction(config) {
  const action = realDefineAction(config);
  const metadata = { accept: config && config.accept === "form" ? "form" : "json" };
  if (config && config.input) {
    try {
      metadata.input = z.toJSONSchema(config.input, { io: "input", unrepresentable: "any" });
    } catch {
      // Keep accept even when the schema cannot be converted.
    }
  }
  try {
    action[Symbol.for(${JSON.stringify(ACTION_METADATA_KEY)})] = metadata;
  } catch {
    // A sealed or frozen handler stays usable without metadata.
  }
  return action;
}
`;
