// @vitest-environment happy-dom

import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

import { setTimeout as sleep } from "node:timers/promises";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { installClientIslandHydrationTracking } from "../../../../src/client/features/islands/client-island-hydration.ts";
import { IslandsPanel } from "../../../../src/client/features/islands/IslandsPanel.tsx";

/** The active panel's live rescan when islands enter or leave the page. */

function embeddedContext(): DockClientScriptContext {
  return { clientType: "embedded" } as unknown as DockClientScriptContext;
}

function createIsland(name: string, componentUrl?: string): HTMLElement {
  const element = document.createElement("astro-island");
  element.setAttribute("opts", JSON.stringify({ name }));
  if (componentUrl !== undefined) element.setAttribute("component-url", componentUrl);
  return element;
}

/** Flush the MutationObserver delivery and the rerender it requests. */
const settle = () => act(() => sleep());

let container: HTMLElement;

async function mountPanel(): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  await act(() => {
    render(<IslandsPanel context={embeddedContext()} refreshKey={1} active />, container);
  });
  return container;
}

afterEach(async () => {
  await act(() => render(null, container));
  document.body.replaceChildren();
});

describe("live island rescans", () => {
  it("shows a failure received before opening and updates another failure without DOM changes", async () => {
    installClientIslandHydrationTracking();
    const failed = createIsland("Failed");
    const pending = createIsland("Pending");
    failed.setAttribute("ssr", "");
    pending.setAttribute("ssr", "");
    document.body.append(failed, pending);
    failed.dispatchEvent(new CustomEvent("astro:hydration-error", { bubbles: true }));
    const panel = await mountPanel();
    const rows = () => [...panel.querySelectorAll('[data-testid="island-row"]')];
    const failedRow = rows()[0];
    expect(failedRow?.textContent).toContain("failed");
    expect(rows()[1]?.textContent).toContain("pending");

    pending.dispatchEvent(new CustomEvent("astro:hydration-error", { bubbles: true }));
    await settle();
    expect(rows()[0]).toBe(failedRow);
    expect(rows()[1]?.textContent).toContain("failed");
    expect(panel.querySelector('[role="status"]')?.textContent).toContain("2 failed.");

    pending.removeAttribute("ssr");
    pending.dispatchEvent(new CustomEvent("astro:hydrate"));
    await settle();
    expect(rows()[1]?.textContent).toContain("hydrated");
  });

  it("picks up failures recorded while the panel is inactive on reactivation", async () => {
    installClientIslandHydrationTracking();
    const element = createIsland("Counter");
    element.setAttribute("ssr", "");
    document.body.append(element);
    const panel = await mountPanel();
    await act(() =>
      render(<IslandsPanel context={embeddedContext()} refreshKey={1} active={false} />, container),
    );
    element.dispatchEvent(new CustomEvent("astro:hydration-error", { bubbles: true }));
    await settle();
    expect(panel.querySelector('[data-testid="island-row"]')?.textContent).toContain("pending");

    await act(() =>
      render(<IslandsPanel context={embeddedContext()} refreshKey={2} active />, container),
    );
    expect(panel.querySelector('[data-testid="island-row"]')?.textContent).toContain("failed");
  });

  it("picks up an astro-island mounted after the panel, even inside an added subtree", async () => {
    const panel = await mountPanel();
    expect(panel.textContent).toContain("No islands on this page.");

    const wrapper = document.createElement("div");
    wrapper.append(createIsland("Counter"));
    document.body.append(wrapper);
    await settle();

    expect(panel.textContent).toContain("1 client island on this page");
    expect(panel.textContent).toContain("Counter");
  });

  it("drops islands whose elements leave the page, even inside a removed subtree", async () => {
    const wrapper = document.createElement("div");
    wrapper.append(createIsland("Nested"));
    document.body.append(createIsland("Counter"), wrapper);
    const panel = await mountPanel();
    expect(panel.textContent).toContain("2 client islands on this page");

    wrapper.remove();
    await settle();
    expect(panel.textContent).toContain("1 client island on this page");
    expect(panel.textContent).not.toContain("Nested");

    document.body.querySelector("astro-island")?.remove();
    await settle();
    expect(panel.textContent).toContain("No islands on this page.");
  });

  it("keeps an existing row and its focus when an island is inserted before it", async () => {
    document.body.append(createIsland("Existing", "/src/components/Existing.tsx"));
    const panel = await mountPanel();
    const existingRow = [...panel.querySelectorAll('[data-testid="island-row"]')].find((row) =>
      row.textContent?.includes("Existing"),
    );
    const sourceButton = existingRow?.querySelector("button") as HTMLButtonElement | undefined;
    sourceButton?.focus();

    document.body.prepend(createIsland("Inserted", "/src/components/Inserted.tsx"));
    await settle();

    const rescannedRow = [...panel.querySelectorAll('[data-testid="island-row"]')].find((row) =>
      row.textContent?.includes("Existing"),
    );
    expect(rescannedRow).toBe(existingRow);
    expect(document.activeElement).toBe(sourceButton);
  });

  it("keeps rescanning after a view transition replaces the body element", async () => {
    const panel = await mountPanel();
    expect(panel.textContent).toContain("No islands on this page.");

    // Astro view transitions swap in a whole new body element; carry the
    // panel over the way persisted elements are.
    const newBody = document.createElement("body");
    newBody.append(container);
    document.body.replaceWith(newBody);
    document.dispatchEvent(new Event("astro:after-swap"));
    await settle();

    newBody.append(createIsland("Counter"));
    await settle();

    expect(panel.textContent).toContain("1 client island on this page");
  });
});
