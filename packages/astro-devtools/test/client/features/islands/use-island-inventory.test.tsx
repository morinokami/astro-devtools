// @vitest-environment happy-dom

import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { IslandInventory } from "../../../../src/client/features/islands/use-island-inventory.ts";

import { useIslandInventory } from "../../../../src/client/features/islands/use-island-inventory.ts";

/** The inventory hook's snapshot lifecycle around its pre-paint scan. */

let container: HTMLElement;
const snapshots: (IslandInventory | undefined)[] = [];

function Probe() {
  snapshots.push(useIslandInventory(true, true, 1));
  return null;
}

afterEach(async () => {
  await act(() => render(null, container));
  document.body.replaceChildren();
  snapshots.length = 0;
});

describe("useIslandInventory", () => {
  it("returns undefined until the first scan, then the scanned page", async () => {
    const element = document.createElement("astro-island");
    element.setAttribute("opts", JSON.stringify({ name: "Counter" }));
    document.body.append(element);
    container = document.createElement("div");
    document.body.append(container);

    await act(() => render(<Probe />, container));

    // The pre-scan commit must not look like an empty page — panels keep
    // their live regions silent while the snapshot is undefined.
    expect(snapshots[0]).toBeUndefined();
    expect(snapshots.at(-1)?.islands.map((island) => island.name)).toEqual(["Counter"]);
  });
});
