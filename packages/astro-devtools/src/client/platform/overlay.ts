/**
 * The page highlight shown while an Islands row is hovered. Positioning
 * is adapted from Astro's MIT-licensed dev toolbar implementation. The
 * overlay elements are created once, but a view transition swaps in a
 * whole new `<body>`, which strands them in the old one and detaches the
 * highlighted element with it: the swap hides the highlight, and the next
 * `showHighlight` mounts the overlay again in the current body.
 */

const HIGHLIGHT_TAG = "astro-devtools-highlight";

/** Custom element for the non-interactive highlight rectangle. */
class AstroDevtoolsHighlight extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    // Panel theme variables are unavailable in the inspected page's DOM.
    style.textContent = `
      :host {
        display: block;
        position: absolute;
        z-index: 2000000000;
        pointer-events: none;
        border: 1px solid rgb(113 24 226);
        border-radius: 4px;
        background: linear-gradient(180deg, rgb(224 204 250 / 0.33) 0%, rgb(224 204 250 / 0.0825) 100%);
      }
    `;
    root.append(style);
  }
}

/** Create the overlay elements only when a panel first needs them. */
let overlayContainer: HTMLElement | undefined;
let highlightElement: HTMLElement | undefined;

/** The element that the highlight currently tracks, while it is visible. */
let highlightedTarget: Element | undefined;

/**
 * Held while the highlight is visible. Aborting it drops every listener the
 * highlight holds at once, so `hideHighlight` does not have to repeat the list
 * that `showHighlight` registers — the two cannot drift apart as listeners are
 * added or removed.
 */
let tracking: AbortController | undefined;

/** Draw the highlight over `target` and keep it there until it is hidden. */
export function showHighlight(target: Element): void {
  const element = getHighlightElement();
  highlightedTarget = target;
  // Fixed targets use viewport coordinates and require a fixed highlight.
  element.style.position = isFixed(target) ? "fixed" : "absolute";
  positionHighlight(element, target.getBoundingClientRect());
  // Moving the pointer within a row or between rows re-shows without hiding
  // first, so the listeners are registered once per visible stretch and only
  // the tracked target changes.
  if (tracking) return;
  tracking = new AbortController();
  const { signal } = tracking;
  window.addEventListener("scroll", reposition, { passive: true, signal });
  window.addEventListener("resize", reposition, { passive: true, signal });
  // A view transition swap detaches the highlighted element, so the
  // highlight must not survive it.
  document.addEventListener("astro:after-swap", hideHighlight, { signal });
}

/** Hide the highlight only when focus or the pointer leaves the entire row. */
export function hideHighlightOnRowLeave(event: FocusEvent | PointerEvent): void {
  const row = event.currentTarget;
  const related = event.relatedTarget;
  if (row instanceof HTMLElement && related instanceof Node && row.contains(related)) return;
  hideHighlight();
}

/** Remove the highlight from the page and stop tracking its element. */
export function hideHighlight(): void {
  highlightedTarget = undefined;
  tracking?.abort();
  tracking = undefined;
  if (highlightElement) highlightElement.style.display = "none";
}

function getHighlightElement(): HTMLElement {
  if (!overlayContainer || !highlightElement) {
    if (!customElements.get(HIGHLIGHT_TAG)) {
      customElements.define(HIGHLIGHT_TAG, AstroDevtoolsHighlight);
    }
    overlayContainer = document.createElement("div");
    // Anchor absolute coordinates at the document origin without affecting layout.
    overlayContainer.style.cssText =
      "position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none;";
    highlightElement = document.createElement(HIGHLIGHT_TAG);
    highlightElement.style.display = "none";
    overlayContainer.append(highlightElement);
  }
  // A view transition swaps in a new `<body>`, stranding a container mounted
  // in the old one, so a detached container is mounted again in the current body.
  if (!overlayContainer.isConnected) document.body.append(overlayContainer);
  return highlightElement;
}

function reposition(): void {
  if (!highlightedTarget || !highlightElement) return;
  positionHighlight(highlightElement, highlightedTarget.getBoundingClientRect());
}

/** Position the highlight around an element's visible box. */
function positionHighlight(element: HTMLElement, rect: DOMRect): void {
  if (rect.width === 0 || rect.height === 0) {
    element.style.display = "none";
    return;
  }
  element.style.display = "block";
  // Fixed rectangles already use viewport coordinates.
  const fixed = element.style.position === "fixed";
  const scrollX = fixed ? 0 : window.scrollX;
  const scrollY = fixed ? 0 : window.scrollY;
  element.style.top = `${Math.max(rect.top + scrollY - 10, 0)}px`;
  element.style.left = `${Math.max(rect.left + scrollX - 10, 0)}px`;
  element.style.width = `${rect.width + 15}px`;
  element.style.height = `${rect.height + 15}px`;
}

/** Whether an element is fixed-positioned, either itself or through an ancestor. */
function isFixed(element: Element): boolean {
  let current: Node | null = element;
  while (current instanceof Element) {
    if (getComputedStyle(current).position === "fixed") return true;
    current = current.parentNode;
  }
  return false;
}
