import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";
import type { FunctionComponent } from "preact";

import { h, render } from "preact";

import panelCss from "../styles.css";

/**
 * Shared panel shell: the props every panel receives, the mount that
 * connects a panel to the dock's activation events, and the shadow-root
 * container it renders into. Popup panels may belong to a different
 * document, so DOM objects are created from `panel.ownerDocument`.
 */

/**
 * `refreshKey` increases whenever the dock entry becomes active. `active`
 * is separate because the dock keeps inactive panels mounted; page observers
 * should run only while their panel is selected.
 */
export interface PanelProps {
  context: DockClientScriptContext;
  refreshKey: number;
  active: boolean;
}

interface PanelInstance {
  activate: () => void;
  deactivate: () => void;
}

/** Fired just before the dock is removed without first deactivating its selected entry. */
const DEVTOOLS_HIDE_EVENT = "devframes:hub-ui:hide";

/** Prevent multiple Preact roots from being mounted in the same panel element. */
const panelInstances = new WeakMap<HTMLElement, PanelInstance>();

/** Mount a panel component and connect it to the dock's activation events. */
export function setupPanel(
  context: DockClientScriptContext,
  Panel: FunctionComponent<PanelProps>,
): void {
  // Popup and passive modes can replace the panel element. Keep the current
  // root so its effects can be cleaned up before mounting the replacement.
  let currentMount: { panel: HTMLElement; container: HTMLElement } | undefined;

  const mountPanel = (panel: HTMLElement): PanelInstance => {
    let instance = panelInstances.get(panel);
    if (!instance) {
      if (currentMount) {
        render(null, currentMount.container);
        panelInstances.delete(currentMount.panel);
      }
      const container = createPanelRoot(panel);
      currentMount = { panel, container };
      instance = createPanelInstance(context, Panel, container);
      panelInstances.set(panel, instance);
      instance.activate();
    }
    return instance;
  };

  const { panel } = context.current.domElements;
  if (panel) mountPanel(panel);

  context.current.events.on("dom:panel:mounted", (mountedPanel) => {
    mountPanel(mountedPanel);
  });
  context.current.events.on("entry:activated", () => {
    const activePanel = context.current.domElements.panel;
    if (activePanel) mountPanel(activePanel).activate();
  });
  // Do not mount a panel merely because a deactivation event arrived.
  context.current.events.on("entry:deactivated", () => {
    const activePanel = context.current.domElements.panel;
    if (activePanel) panelInstances.get(activePanel)?.deactivate();
  });
  // Passive mode hides the dock without firing an entry deactivation event.
  window.addEventListener(DEVTOOLS_HIDE_EVENT, () => {
    if (currentMount) panelInstances.get(currentMount.panel)?.deactivate();
  });
}

function createPanelInstance(
  context: DockClientScriptContext,
  Panel: FunctionComponent<PanelProps>,
  container: HTMLElement,
): PanelInstance {
  let refreshKey = 0;
  let active = false;

  const rerender = (): void => {
    render(h(Panel, { context, refreshKey, active }), container);
  };

  return {
    activate: () => {
      refreshKey += 1;
      active = true;
      rerender();
    },
    deactivate: () => {
      if (!active) return;
      active = false;
      rerender();
    },
  };
}

/**
 * Cache one stylesheet per document. Constructed stylesheets cannot be
 * shared with the separate document used by popup mode.
 */
const panelStyleSheets = new WeakMap<Document, CSSStyleSheet>();

/**
 * Create a shadow-root container for a panel. Nodes and styles come from the
 * panel's document so this also works in popup mode.
 */
export function createPanelRoot(panel: HTMLElement): HTMLElement {
  const document = panel.ownerDocument;
  const host = document.createElement("div");
  host.style.height = "100%";
  const root = host.attachShadow({ mode: "open" });
  root.adoptedStyleSheets = [getPanelStyleSheet(document)];
  const container = document.createElement("div");
  container.className = "@container/panel h-full";
  root.append(container);
  panel.append(host);
  return container;
}

/** Create or reuse the stylesheet for a panel's document. */
function getPanelStyleSheet(document: Document): CSSStyleSheet {
  const cached = panelStyleSheets.get(document);
  if (cached) return cached;
  const view = document.defaultView ?? window;
  const sheet = new view.CSSStyleSheet();
  sheet.replaceSync(panelCss);
  panelStyleSheets.set(document, sheet);
  enableTailwindPropertyFallback(view, sheet);
  return sheet;
}

/**
 * Make Tailwind's custom-property defaults available inside shadow roots.
 * Registering them on the page would change the inspected app, so the
 * declarations from Tailwind's fallback layer are copied instead.
 */
function enableTailwindPropertyFallback(
  view: Window & typeof globalThis,
  sheet: CSSStyleSheet,
): void {
  // CSS rules must be checked against constructors from their own window.
  const LayerBlockRule: typeof CSSLayerBlockRule | undefined = view.CSSLayerBlockRule;
  const SupportsRule: typeof CSSSupportsRule | undefined = view.CSSSupportsRule;
  if (LayerBlockRule === undefined || SupportsRule === undefined) return;
  const texts: string[] = [];
  for (const rule of sheet.cssRules) {
    if (!(rule instanceof LayerBlockRule) || rule.name !== "properties") continue;
    for (const inner of rule.cssRules) {
      if (inner instanceof SupportsRule) {
        for (const guarded of inner.cssRules) texts.push(guarded.cssText);
      }
    }
  }
  if (texts.length === 0) return;
  sheet.insertRule(`@layer properties{${texts.join("")}}`, sheet.cssRules.length);
}
