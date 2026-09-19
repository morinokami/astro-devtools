import type { RunnableDevEnvironment } from "vite";

import type { AstroDevtoolsStore } from "../store.ts";
import type { ActionDescriptor } from "../types.ts";

import { ACTION_METADATA_KEY } from "../actions-metadata.ts";

/**
 * Load action names and metadata from the module instance that the app
 * itself uses, so module-level code never runs again for the panel;
 * metadata comes from the wrapped `defineAction` (see actions-metadata.ts).
 * The astro dev server evaluates server code through the ssr environment's
 * module runner — `ssrLoadModule` evaluates the same module graph on a
 * separate compat runner and would give the panel a second instance. When
 * an adapter replaces the ssr environment with a non-runnable runtime, the
 * app's instance is out of reach from Node, and evaluating the module on
 * any other runner (`prerender`, the compat runner) would run its top-level
 * code again — so the panel reports the module as not loadable instead.
 */
export async function loadActionsModule(store: AstroDevtoolsStore): Promise<unknown> {
  const { actionsModulePath, viteServer } = store;
  if (!actionsModulePath || !viteServer) return undefined;
  // `isRunnableDevEnvironment` would be the official runner probe, but it
  // checks `instanceof` against whichever vite copy this package resolves —
  // the app's may be a different instance — and its value import would also
  // pull vite into the published bundle. Probing `runner` avoids both.
  const environment = viteServer.environments.ssr as Partial<RunnableDevEnvironment> | undefined;
  const runner = environment?.runner;
  if (!runner) return undefined;
  try {
    return await runner.import<Record<string, unknown>>(actionsModulePath);
  } catch {
    return undefined;
  }
}

/**
 * List exported actions in definition order, preserving nested export names.
 * `undefined` only when the module itself is unavailable: a module that
 * loaded but exports no usable `server` record has no actions to call, which
 * an empty list says — `undefined` is reserved for "could not be loaded".
 */
export function listActions(actionsModule: unknown): ActionDescriptor[] | undefined {
  if (typeof actionsModule !== "object" || actionsModule === null) return undefined;
  const server = (actionsModule as { server?: unknown }).server;
  if (typeof server !== "object" || server === null) return [];
  const actions: ActionDescriptor[] = [];
  // Stop cycles only along the current recursion path. Once a group has
  // been visited, another export may expose it under a different public name.
  const ancestors = new WeakSet<object>();
  const walk = (record: object, parentSegments: string[]): void => {
    if (ancestors.has(record)) return;
    ancestors.add(record);
    for (const [name, value] of Object.entries(record)) {
      if (value === null || value === undefined) continue;
      const segments = [...parentSegments, name];
      // Astro reaches an action by walking `server` until it finds a function
      // (`getAction`) and rejects anything else, so a function is the action
      // and every other object is a group — the module namespace of an
      // `import * as group` file included, which a plain-object test rejects
      // over its null prototype even though Astro walks straight through it.
      if (typeof value === "function") {
        actions.push({ segments, qualifiedName: segments.join("."), ...readActionMetadata(value) });
      } else if (typeof value === "object") {
        walk(value, segments);
      }
    }
    ancestors.delete(record);
  };
  walk(server, []);
  return actions;
}

/** Read metadata from project code while validating its format. */
function readActionMetadata(value: unknown): Omit<ActionDescriptor, "segments" | "qualifiedName"> {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") return {};
  const metadata = (value as Record<symbol, unknown>)[Symbol.for(ACTION_METADATA_KEY)];
  if (typeof metadata !== "object" || metadata === null) return {};
  const { accept, input } = metadata as { accept?: unknown; input?: unknown };
  const schema = typeof input === "object" && input !== null ? copyInputSchema(input) : undefined;
  return {
    ...(accept === "json" || accept === "form" ? { accept } : {}),
    ...(schema === undefined ? {} : { input: schema }),
  };
}

/**
 * Copy an action's input schema. The metadata lives on the handler, so one
 * action exported under two names — `{ likes, addLike: likes.add }` — builds
 * two descriptors from one metadata object, and devframe's MCP serializer
 * prints the second occurrence of a shared reference as "[Circular]" instead
 * of the schema. A schema that cannot be copied could not have been
 * serialized either, so it is left out rather than failing the whole query.
 */
function copyInputSchema(input: object): unknown {
  try {
    return structuredClone(input);
  } catch {
    return undefined;
  }
}

/** Apply Astro's trailing-slash rule to action endpoint URLs. */
export function shouldAppendForwardSlash(
  trailingSlash: string | undefined,
  buildFormat: string | undefined,
): boolean {
  switch (trailingSlash) {
    case "always":
      return true;
    case "never":
      return false;
    default:
      return buildFormat === "directory";
  }
}
