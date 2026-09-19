// @vitest-environment happy-dom

// The real serializer that the props attribute goes through in an Astro
// app, so the fixtures cannot drift from Astro's actual tagged-tuple format.
import { serializeProps } from "astro/runtime/server/serialize.js";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { scanIslands } from "../../../../src/client/features/islands/islands.ts";

/** Parse realistic astro-island elements in happy-dom. */

interface IslandAttributes {
  opts?: string;
  client?: string;
  props?: string;
  "component-url"?: string;
  "component-export"?: string;
  "renderer-url"?: string;
  ssr?: string;
}

function appendIsland(attributes: IslandAttributes): HTMLElement {
  const element = document.createElement("astro-island");
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  document.body.append(element);
  return element;
}

const scanPageIslands = () => scanIslands(document);

afterEach(() => {
  document.body.replaceChildren();
});

describe("scanIslands", () => {
  it("reads the name, directive, paths and props of an island", () => {
    appendIsland({
      opts: JSON.stringify({ name: "Counter", value: "" }),
      client: "load",
      "component-url": "/src/components/Counter.tsx",
      "component-export": "default",
      props: serializeProps({ start: 5 }),
      ssr: "",
    });

    expect(scanPageIslands()).toMatchObject([
      {
        name: "Counter",
        directive: "client:load",
        displayPath: "src/components/Counter.tsx",
        editorPath: "src/components/Counter.tsx",
        propsSummary: `{"start":5}`,
        state: "pending",
      },
    ]);
  });

  it("returns the islands in document order, with their elements", () => {
    appendIsland({ opts: JSON.stringify({ name: "First" }) });
    appendIsland({ opts: JSON.stringify({ name: "Second" }) });

    const scanned = scanPageIslands();
    expect(scanned.map((entry) => entry.name)).toEqual(["First", "Second"]);
    expect(scanned.map((entry) => entry.element)).toEqual([...document.body.children]);
  });

  it("keeps an island's identity when another island is inserted before it", () => {
    const existing = appendIsland({ opts: JSON.stringify({ name: "Existing" }) });
    const initialId = scanPageIslands().find((island) => island.element === existing)?.id;

    const inserted = appendIsland({ opts: JSON.stringify({ name: "Inserted" }) });
    document.body.prepend(inserted);
    const rescanned = scanPageIslands();

    expect(rescanned.find((island) => island.element === existing)?.id).toBe(initialId);
    expect(rescanned.find((island) => island.element === inserted)?.id).not.toBe(initialId);
  });

  it("has no directive when the island has no client attribute", () => {
    appendIsland({ opts: JSON.stringify({ name: "Counter" }) });
    expect(scanPageIslands()[0]?.directive).toBeUndefined();
  });
});

describe("name", () => {
  it("prefers the display name Astro serialized into opts", () => {
    appendIsland({
      opts: JSON.stringify({ name: "Counter", value: "" }),
      "component-url": "/src/components/counter-impl.tsx",
    });
    expect(scanPageIslands()[0]?.name).toBe("Counter");
  });

  it("falls back to the component file name without its extension", () => {
    appendIsland({ "component-url": "/src/components/Newsletter.svelte" });
    expect(scanPageIslands()[0]?.name).toBe("Newsletter");
  });

  it("falls back to the file name when opts is not parseable or has no name", () => {
    appendIsland({ opts: "{not json", "component-url": "/src/components/Broken.jsx" });
    appendIsland({
      opts: JSON.stringify({ value: "" }),
      "component-url": "/src/components/Nameless.jsx",
    });
    expect(scanPageIslands().map((entry) => entry.name)).toEqual(["Broken", "Nameless"]);
  });

  it("falls back to a generic name with neither opts nor a component url", () => {
    appendIsland({ client: "load" });
    expect(scanPageIslands()[0]?.name).toBe("island");
  });
});

describe("props", () => {
  it("unwraps Astro's [type, value] tuples onto one line", () => {
    appendIsland({ props: serializeProps({ start: 5, label: "Clicks", open: true }) });
    expect(scanPageIslands()[0]?.propsSummary).toBe(`{"start":5,"label":"Clicks","open":true}`);
  });

  it("unwraps the tuples Astro nests inside objects and arrays", () => {
    appendIsland({
      props: serializeProps({
        user: { name: "Ada", roles: ["admin", "editor"] },
        matrix: [[1, 2], [3]],
      }),
    });
    expect(scanPageIslands()[0]?.propsSummary).toBe(
      `{"user":{"name":"Ada","roles":["admin","editor"]},"matrix":[[1,2],[3]]}`,
    );
  });

  it("shows types without a JSON form as their closest JSON value", () => {
    appendIsland({
      props: serializeProps({
        when: new Date("2026-08-14T00:00:00.000Z"),
        lookup: new Map([["a", 1]]),
        flags: new Set(["x", "y"]),
        big: 10n,
        pattern: /^a+$/,
        site: new URL("https://example.com/"),
        bytes: new Uint8Array([1, 2]),
        limit: Number.POSITIVE_INFINITY,
        floor: Number.NEGATIVE_INFINITY,
      }),
    });
    expect(scanPageIslands()[0]?.propsSummary).toBe(
      `{"when":"2026-08-14T00:00:00.000Z","lookup":[["a",1]],"flags":["x","y"],` +
        `"big":"10","pattern":"^a+$","site":"https://example.com/","bytes":[1,2],` +
        `"limit":"Infinity","floor":"-Infinity"}`,
    );
  });

  it("drops Astro's scoped-style props", () => {
    appendIsland({ props: serializeProps({ "data-astro-cid-abc123": true, start: 5 }) });
    expect(scanPageIslands()[0]?.propsSummary).toBe(`{"start":5}`);
  });

  it("drops the view-transition props Astro adds beside the real ones", () => {
    // A `transition:persist`/`transition:name` component is serialized with
    // Astro's plumbing in the same `props` attribute.
    appendIsland({
      props: serializeProps({
        start: 5,
        "data-astro-transition-scope": "astro-v5paxn7m-1",
        "data-astro-transition-persist": "counter",
        "data-astro-transition-persist-props": "false",
      }),
    });
    expect(scanPageIslands()[0]?.propsSummary).toBe(`{"start":5}`);
  });

  it("has no summary when every prop is filtered out, or there were none", () => {
    appendIsland({ props: serializeProps({ "data-astro-cid-abc123": true }) });
    appendIsland({ props: "{}" });
    appendIsland({ client: "load" });
    expect(scanPageIslands().map((entry) => entry.propsSummary)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("has no summary when the props attribute does not parse", () => {
    appendIsland({ props: "{start: 5}" });
    expect(scanPageIslands()[0]?.propsSummary).toBeUndefined();
  });
});

describe("paths", () => {
  it("strips the dev server's cache-busting query", () => {
    appendIsland({ "component-url": "/src/components/Counter.tsx?t=1730000000000" });
    expect(scanPageIslands()[0]).toMatchObject({
      displayPath: "src/components/Counter.tsx",
      editorPath: "src/components/Counter.tsx",
    });
  });

  it("keeps a /@fs/ component outside the root as an absolute path", () => {
    appendIsland({ "component-url": "/@fs/Users/dev/packages/ui/Widget.tsx?t=1" });
    expect(scanPageIslands()[0]).toMatchObject({
      displayPath: "/Users/dev/packages/ui/Widget.tsx",
      editorPath: "/Users/dev/packages/ui/Widget.tsx",
    });
  });

  it("keeps the drive letter of a Windows /@fs/ path", () => {
    // After `/@fs/` a Windows path starts with `C:` and no slash; only the
    // volume check keeps it absolute. No darwin/linux dev machine ever
    // exercises this branch, so this test is its only coverage.
    appendIsland({ "component-url": "/@fs/C:/Users/dev/ui/Widget.tsx?t=1" });
    expect(scanPageIslands()[0]).toMatchObject({
      displayPath: "C:/Users/dev/ui/Widget.tsx",
      editorPath: "C:/Users/dev/ui/Widget.tsx",
    });
  });

  it("decodes an escaped component url", () => {
    appendIsland({ "component-url": "/src/components/My%20Counter.tsx" });
    expect(scanPageIslands()[0]?.displayPath).toBe("src/components/My Counter.tsx");
  });

  it("has no path when the island has no component url", () => {
    appendIsland({ client: "load" });
    const entry = scanPageIslands()[0];
    expect(entry?.displayPath).toBeUndefined();
    expect(entry?.editorPath).toBeUndefined();
  });
});

describe("framework", () => {
  it("identifies each official renderer from renderer-url", () => {
    appendIsland({
      "renderer-url": "/@fs/Users/dev/node_modules/@astrojs/preact/dist/client-dev.js",
    });
    appendIsland({ "renderer-url": "/node_modules/@astrojs/react/dist/client.js" });
    appendIsland({ "renderer-url": "/node_modules/@astrojs/solid-js/dist/client.js" });
    appendIsland({ "renderer-url": "/node_modules/@astrojs/svelte/dist/client.js" });
    appendIsland({ "renderer-url": "/node_modules/@astrojs/vue/dist/client.js" });
    expect(scanPageIslands().map((entry) => entry.framework)).toEqual([
      "preact",
      "react",
      "solid",
      "svelte",
      "vue",
    ]);
  });

  it("never reads @astrojs/preact as react, in any URL form the dev server emits", () => {
    // pnpm's store flattens the scope with `+`, Vite's dep optimizer with
    // `_`; `react` appears as a substring in all three of these.
    appendIsland({
      "renderer-url":
        "/@fs/Users/dev/node_modules/.pnpm/@astrojs+preact@6.0.2_hash/node_modules/@astrojs/preact/dist/client-dev.js",
    });
    appendIsland({
      "renderer-url": "/node_modules/.vite/deps/@astrojs_preact_client-dev.js?v=abc123",
    });
    appendIsland({ "renderer-url": "/node_modules/@astrojs/preact/dist/client.js" });
    expect(scanPageIslands().map((entry) => entry.framework)).toEqual([
      "preact",
      "preact",
      "preact",
    ]);
  });

  it("falls back to the component extension when the renderer is unknown", () => {
    appendIsland({
      "renderer-url": "/node_modules/some-community-renderer/client.js",
      "component-url": "/src/components/Widget.vue",
    });
    appendIsland({ "component-url": "/src/components/Widget.svelte" });
    expect(scanPageIslands().map((entry) => entry.framework)).toEqual(["vue", "svelte"]);
  });

  it("stays undetected rather than guessing a JSX island's framework", () => {
    appendIsland({
      "renderer-url": "/node_modules/some-community-renderer/client.js",
      "component-url": "/src/components/Widget.tsx",
    });
    appendIsland({ client: "load" });
    expect(scanPageIslands().map((entry) => entry.framework)).toEqual([undefined, undefined]);
  });
});

describe("hydration state", () => {
  it("is pending while the ssr attribute is there and hydrated once it goes", () => {
    appendIsland({ opts: JSON.stringify({ name: "Counter" }), ssr: "" });
    expect(scanPageIslands()[0]?.state).toBe("pending");

    // astro-island removes `ssr` when hydration completes.
    document.body.firstElementChild?.removeAttribute("ssr");
    expect(scanPageIslands()[0]?.state).toBe("hydrated");
  });
});
