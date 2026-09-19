import type { ViteDevServer } from "vite";

import { describe, expect, it } from "vite-plus/test";

import { ACTION_METADATA_KEY } from "../../src/actions-metadata.ts";
import {
  listActions,
  loadActionsModule,
  shouldAppendForwardSlash,
} from "../../src/panels/actions.ts";
import { createStore } from "../../src/store.ts";

/** What `defineAction` hands back: the handler, plus `orThrow` on it. */
function action(): unknown {
  return Object.assign(() => {}, { orThrow: () => {} });
}

/** An action handler with the metadata collected by the wrapper module. */
function actionWithMetadata(metadata: unknown): unknown {
  return Object.assign(action() as object, { [Symbol.for(ACTION_METADATA_KEY)]: metadata });
}

/** A store pointing at an actions file served by `server`, a fake dev server. */
function storeWith(server: unknown, actionsModulePath = "/project/src/actions.ts") {
  const store = createStore();
  store.setActionsModulePath(actionsModulePath);
  store.setViteServer(server as ViteDevServer);
  return store;
}

describe("loadActionsModule", () => {
  it("imports the actions file through the app's own ssr runner", async () => {
    const actionsModule = { server: {} };
    const imported: string[] = [];
    const server = {
      environments: {
        ssr: {
          runner: {
            import: async (id: string) => {
              imported.push(id);
              return actionsModule;
            },
          },
        },
      },
    };

    await expect(loadActionsModule(storeWith(server))).resolves.toBe(actionsModule);
    expect(imported).toEqual(["/project/src/actions.ts"]);
  });

  it("reports the module as not loadable without an actions file or a dev server", async () => {
    const store = createStore();

    await expect(loadActionsModule(store)).resolves.toBeUndefined();
    store.setActionsModulePath("/project/src/actions.ts");
    await expect(loadActionsModule(store)).resolves.toBeUndefined();
  });

  it("reports the module as not loadable when the ssr environment has no runner", async () => {
    // An adapter replaced the ssr environment with a non-runnable runtime.
    const server = { environments: { ssr: {} } };

    await expect(loadActionsModule(storeWith(server))).resolves.toBeUndefined();
  });

  it("reports a module that fails to evaluate as not loadable", async () => {
    const server = {
      environments: {
        ssr: {
          runner: {
            import: async () => {
              throw new Error("module-level code threw");
            },
          },
        },
      },
    };

    await expect(loadActionsModule(storeWith(server))).resolves.toBeUndefined();
  });
});

describe("listActions", () => {
  it("lists qualified names and export segments in definition order", () => {
    const actionsModule = {
      server: {
        greet: action(),
        feedback: { submit: action(), remove: action() },
        admin: { users: { ban: action() } },
      },
    };

    expect(listActions(actionsModule)).toEqual([
      { segments: ["greet"], qualifiedName: "greet" },
      { segments: ["feedback", "submit"], qualifiedName: "feedback.submit" },
      { segments: ["feedback", "remove"], qualifiedName: "feedback.remove" },
      { segments: ["admin", "users", "ban"], qualifiedName: "admin.users.ban" },
    ]);
  });

  it("preserves a literal dot in an export name as one segment", () => {
    const actionsModule = { server: { "feedback.submit": action() } };

    expect(listActions(actionsModule)).toEqual([
      { segments: ["feedback.submit"], qualifiedName: "feedback.submit" },
    ]);
  });

  it("treats a function carrying properties as one action, not a group", () => {
    const actionsModule = { server: { greet: action() } };

    expect(listActions(actionsModule)).toEqual([{ segments: ["greet"], qualifiedName: "greet" }]);
  });

  it("walks a module namespace group, whose prototype is null", () => {
    // `import * as users from "./users.ts"; export const server = { users }`.
    // Astro resolves `users.update` through it, so the panel must list it.
    const users: object = Object.assign(Object.create(null) as object, {
      update: action(),
      remove: action(),
    });

    expect(listActions({ server: { users } })).toEqual([
      { segments: ["users", "update"], qualifiedName: "users.update" },
      { segments: ["users", "remove"], qualifiedName: "users.remove" },
    ]);
  });

  it("leaves out a value that Astro could not call as an action either", () => {
    // Astro walks `server` until it reaches a function and rejects whatever
    // else it lands on, so neither of these is an action.
    class Handler {
      run(): void {}
    }

    expect(listActions({ server: { legacy: new Handler(), version: "1.0" } })).toEqual([]);
  });

  it("walks a group that re-exports the module it lives in only once", () => {
    const server: Record<string, unknown> = { greet: action() };
    server.self = server;

    expect(listActions({ server })).toEqual([{ segments: ["greet"], qualifiedName: "greet" }]);
  });

  it.each(["plain object", "module namespace"])(
    "lists every public path for a shared %s group",
    (kind) => {
      const users = Object.assign(kind === "module namespace" ? Object.create(null) : {}, {
        update: action(),
      });

      expect(listActions({ server: { users, admin: { users } } })).toEqual([
        { segments: ["users", "update"], qualifiedName: "users.update" },
        { segments: ["admin", "users", "update"], qualifiedName: "admin.users.update" },
      ]);
    },
  );

  it("stops indirect cycles while preserving aliases of the cyclic group", () => {
    const users: Record<string, unknown> = { update: action() };
    users.nested = { parent: users };

    expect(listActions({ server: { users, usersAlias: users } })).toEqual([
      { segments: ["users", "update"], qualifiedName: "users.update" },
      { segments: ["usersAlias", "update"], qualifiedName: "usersAlias.update" },
    ]);
  });

  it("skips null and undefined values", () => {
    const actionsModule = {
      server: { greet: action(), missing: undefined, removed: null },
    };

    expect(listActions(actionsModule)).toEqual([{ segments: ["greet"], qualifiedName: "greet" }]);
  });

  it("returns an empty list for an empty server export", () => {
    expect(listActions({ server: {} })).toEqual([]);
    expect(listActions({ server: { group: {} } })).toEqual([]);
  });

  it("returns undefined only when the module itself is unavailable", () => {
    expect(listActions(undefined)).toBeUndefined();
  });

  it("returns an empty list for a module that loaded without a usable server export", () => {
    // The file imported cleanly, so reporting it as not loadable would send
    // the user looking for an import error that does not exist.
    expect(listActions({})).toEqual([]);
    expect(listActions({ server: "not-a-record" })).toEqual([]);
    expect(listActions({ server: null })).toEqual([]);
  });

  it("reports the collected accept option and input schema", () => {
    const input = { type: "object", properties: { name: { type: "string" } } };
    const actionsModule = {
      server: {
        greet: actionWithMetadata({ accept: "json", input }),
        submit: actionWithMetadata({ accept: "form" }),
      },
    };

    expect(listActions(actionsModule)).toEqual([
      { segments: ["greet"], qualifiedName: "greet", accept: "json", input },
      { segments: ["submit"], qualifiedName: "submit", accept: "form" },
    ]);
  });

  it("gives an action exported twice its own copy of the input schema", () => {
    // The metadata lives on the handler, so both descriptors read one
    // object; devframe's MCP serializer would print the second occurrence
    // of a shared reference as "[Circular]" instead of the schema.
    const input = { type: "object", properties: { post: { type: "string" } } };
    const add = actionWithMetadata({ accept: "json", input });
    const actions = listActions({ server: { likes: { add }, addLike: add } }) ?? [];

    expect(actions.map((action) => action.qualifiedName)).toEqual(["likes.add", "addLike"]);
    expect(actions[0]?.input).toEqual(input);
    expect(actions[1]?.input).toEqual(input);
    expect(actions[0]?.input).not.toBe(actions[1]?.input);
    expect(actions[0]?.input).not.toBe(input);
  });

  it("ignores metadata with an unexpected format", () => {
    const actionsModule = {
      server: {
        bare: action(),
        odd: actionWithMetadata("not-a-record"),
        wrong: actionWithMetadata({ accept: "carrier-pigeon", input: 42 }),
      },
    };

    expect(listActions(actionsModule)).toEqual([
      { segments: ["bare"], qualifiedName: "bare" },
      { segments: ["odd"], qualifiedName: "odd" },
      { segments: ["wrong"], qualifiedName: "wrong" },
    ]);
  });
});

describe("shouldAppendForwardSlash", () => {
  it("follows trailingSlash for `always` and `never`", () => {
    expect(shouldAppendForwardSlash("always", "file")).toBe(true);
    expect(shouldAppendForwardSlash("never", "directory")).toBe(false);
  });

  it("falls back to the build format under `ignore`", () => {
    expect(shouldAppendForwardSlash("ignore", "directory")).toBe(true);
    expect(shouldAppendForwardSlash("ignore", "file")).toBe(false);
    expect(shouldAppendForwardSlash("ignore", "preserve")).toBe(false);
  });

  it("treats missing values like astro's resolved defaults", () => {
    // Resolved config always includes both values; unset inputs mean the
    // store has not seen `astro:config:done` yet, and `ignore`/`directory`
    // are what that config would resolve to.
    expect(shouldAppendForwardSlash(undefined, "directory")).toBe(true);
    expect(shouldAppendForwardSlash(undefined, undefined)).toBe(false);
  });
});
