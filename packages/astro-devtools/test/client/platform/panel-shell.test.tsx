// @vitest-environment happy-dom

import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

import { Window } from "happy-dom";
import { useEffect } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { PanelProps } from "../../../src/client/platform/panel-shell.ts";

import { createPanelRoot, setupPanel } from "../../../src/client/platform/panel-shell.ts";

/**
 * Exercise panel mounting, activation, replacement, and cleanup, then the
 * document-scoped container that popup mode depends on.
 */

/** Create the dock events and DOM state needed by `setupPanel`. */
function fakeDock(panel?: HTMLElement) {
  const listeners = new Map<string, Set<(eventData?: unknown) => void>>();
  const domElements: { panel?: HTMLElement } = { panel };
  const context = {
    clientType: "embedded",
    current: {
      domElements,
      events: {
        on: (event: string, listener: (eventData?: unknown) => void) => {
          let set = listeners.get(event);
          if (!set) {
            set = new Set();
            listeners.set(event, set);
          }
          set.add(listener);
          return () => set.delete(listener);
        },
      },
    },
  };
  return {
    context: context as unknown as DockClientScriptContext,
    emit: (event: string, eventData?: unknown): void => {
      for (const listener of listeners.get(event) ?? []) listener(eventData);
    },
    /** The dock assigns the new element before announcing it. */
    replacePanel: (next: HTMLElement): void => {
      domElements.panel = next;
    },
  };
}

/** Create a panel that records renders and effect lifecycles. */
function createTestPanel() {
  const log = {
    renders: [] as { refreshKey: number; active: boolean }[],
    connects: 0,
    cleanups: 0,
  };
  function TestPanel({ refreshKey, active }: PanelProps) {
    log.renders.push({ refreshKey, active });
    // Real panels use the same active-only effect pattern.
    useEffect(() => {
      if (!active) return;
      log.connects += 1;
      return () => {
        log.cleanups += 1;
      };
    }, [active]);
    return <div />;
  }
  return { log, TestPanel };
}

function panelElement(): HTMLElement {
  const panel = document.createElement("div");
  document.body.append(panel);
  return panel;
}

/** Create a second document like the one used by popup mode. */
function createForeignPanel(): {
  document: Document;
  panel: HTMLElement;
  close: () => void;
} {
  const foreignWindow = new Window();
  const foreignDocument = foreignWindow.document as unknown as Document;
  const panel = foreignDocument.createElement("div");
  foreignDocument.body.append(panel);
  return { document: foreignDocument, panel, close: () => foreignWindow.close() };
}

let foreignPanel: ReturnType<typeof createForeignPanel> | undefined;

afterEach(() => {
  foreignPanel?.close();
  foreignPanel = undefined;
  document.body.replaceChildren();
  document.adoptedStyleSheets = [];
});

describe("setupPanel", () => {
  it("mounts the selected panel with refresh key 1", async () => {
    const dock = fakeDock(panelElement());
    const { log, TestPanel } = createTestPanel();
    await act(() => {
      setupPanel(dock.context, TestPanel);
    });
    expect(log.renders.at(-1)).toEqual({ refreshKey: 1, active: true });
    expect(log.connects).toBe(1);
  });

  it("ignores lifecycle events for an entry whose panel never mounted", async () => {
    const dock = fakeDock();
    const { log, TestPanel } = createTestPanel();
    await act(() => {
      setupPanel(dock.context, TestPanel);
      dock.emit("entry:deactivated");
      dock.emit("entry:activated");
    });
    expect(log.renders).toEqual([]);
  });

  it("deactivates once and increments the refresh key on reactivation", async () => {
    const dock = fakeDock(panelElement());
    const { log, TestPanel } = createTestPanel();
    await act(() => {
      setupPanel(dock.context, TestPanel);
    });

    await act(() => {
      dock.emit("entry:deactivated");
    });
    expect(log.renders.at(-1)).toEqual({ refreshKey: 1, active: false });
    expect(log.cleanups).toBe(1);

    // Repeated deactivation must not re-render an already inactive panel.
    const renders = log.renders.length;
    await act(() => {
      dock.emit("entry:deactivated");
    });
    expect(log.renders.length).toBe(renders);
    expect(log.cleanups).toBe(1);

    await act(() => {
      dock.emit("entry:activated");
    });
    expect(log.renders.at(-1)).toEqual({ refreshKey: 2, active: true });
    expect(log.connects).toBe(2);
  });

  it("unmounts the abandoned tree when the dock replaces the panel element", async () => {
    const dock = fakeDock(panelElement());
    const { log, TestPanel } = createTestPanel();
    await act(() => {
      setupPanel(dock.context, TestPanel);
    });
    expect(log.connects).toBe(1);

    // Passive mode's reveal (and a popup-mode toggle) build a fresh panel
    // element; the tree in the old one must not keep its effects alive.
    const replacement = panelElement();
    await act(() => {
      dock.replacePanel(replacement);
      dock.emit("dom:panel:mounted", replacement);
    });
    expect(log.cleanups).toBe(1);
    expect(log.renders.at(-1)).toEqual({ refreshKey: 1, active: true });
    expect(log.connects).toBe(2);
  });

  it("deactivates the panel during passive-mode teardown", async () => {
    const panel = panelElement();
    const dock = fakeDock(panel);
    const { log, TestPanel } = createTestPanel();
    await act(() => {
      setupPanel(dock.context, TestPanel);
    });

    // Passive mode removes the selected dock without an entry deactivation event.
    panel.remove();
    await act(() => {
      window.dispatchEvent(new CustomEvent("devframes:hub-ui:hide"));
    });
    expect(log.renders.at(-1)).toEqual({ refreshKey: 1, active: false });
    expect(log.cleanups).toBe(1);

    // Revealing the dock mounts a newly created panel element.
    const replacement = panelElement();
    await act(() => {
      dock.replacePanel(replacement);
      dock.emit("dom:panel:mounted", replacement);
    });
    expect(log.renders.at(-1)).toEqual({ refreshKey: 1, active: true });
    expect(log.connects).toBe(2);
  });
});

describe("createPanelRoot", () => {
  it("builds the host and container in the panel's document", () => {
    foreignPanel = createForeignPanel();
    const container = createPanelRoot(foreignPanel.panel);

    // happy-dom adopts appended nodes, so stylesheet tests provide the stronger check.
    const host = foreignPanel.panel.firstElementChild as HTMLElement;
    expect(container.ownerDocument).toBe(foreignPanel.document);
    expect(host.ownerDocument).toBe(foreignPanel.document);
    // The same element is Preact's target and the responsive container.
    expect(container.className).toContain("@container/panel");
    expect(container.parentNode).toBe(host.shadowRoot);
  });

  it("adopts a stylesheet constructed in the panel's document", () => {
    foreignPanel = createForeignPanel();
    createPanelRoot(foreignPanel.panel);

    const root = (foreignPanel.panel.firstElementChild as HTMLElement).shadowRoot;
    expect(root?.adoptedStyleSheets).toHaveLength(1);
    // A real browser rejects a stylesheet constructed in another document.
    const sheet = root?.adoptedStyleSheets[0];
    const ForeignStyleSheet = (foreignPanel.document.defaultView as unknown as typeof globalThis)
      .CSSStyleSheet;
    expect(sheet).toBeInstanceOf(ForeignStyleSheet);
  });

  it("leaves the current document untouched for a popup panel", () => {
    foreignPanel = createForeignPanel();
    createPanelRoot(foreignPanel.panel);

    expect(document.body.childNodes).toHaveLength(0);
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it("reuses one sheet across panels of the same document", () => {
    foreignPanel = createForeignPanel();
    const secondPanel = foreignPanel.document.createElement("div");
    foreignPanel.document.body.append(secondPanel);

    createPanelRoot(foreignPanel.panel);
    createPanelRoot(secondPanel);

    const sheetOf = (panel: HTMLElement) =>
      (panel.firstElementChild as HTMLElement).shadowRoot?.adoptedStyleSheets[0];
    // Five open panels share one CSSStyleSheet, not five copies of it.
    expect(sheetOf(foreignPanel.panel)).toBe(sheetOf(secondPanel));
  });

  it("gives each document its own sheet", () => {
    foreignPanel = createForeignPanel();
    const localPanel = document.createElement("div");
    document.body.append(localPanel);

    createPanelRoot(foreignPanel.panel);
    createPanelRoot(localPanel);

    const foreignSheet = (foreignPanel.panel.firstElementChild as HTMLElement).shadowRoot
      ?.adoptedStyleSheets[0];
    const localSheet = (localPanel.firstElementChild as HTMLElement).shadowRoot
      ?.adoptedStyleSheets[0];
    expect(foreignSheet).not.toBe(localSheet);
  });
});
