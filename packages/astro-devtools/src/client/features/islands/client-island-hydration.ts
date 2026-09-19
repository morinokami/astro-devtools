/**
 * Record Astro's hydration failures from page load, before the Islands panel
 * opens. The document owns the WeakSet because inject and client are separate
 * bundles; module-local state (including stableElementId's ids) is not shared.
 * Element identity separates instances of the same component and lets removed
 * islands be collected across View Transitions, while persisted islands keep
 * their state. Successful hydration clears a previous failure.
 */

const FAILURES_KEY = "__astroDevtoolsClientIslandHydrationFailures";

type TrackedDocument = Document & { [FAILURES_KEY]?: WeakSet<Element> };

/** Install once per document, before hydration can fail. */
export function installClientIslandHydrationTracking(documentToTrack: Document = document): void {
  const tracked = documentToTrack as TrackedDocument;
  if (tracked[FAILURES_KEY] !== undefined) return;
  const failures = new WeakSet<Element>();
  tracked[FAILURES_KEY] = failures;

  // Capture also sees the non-bubbling success event and does not depend on
  // the inspected app allowing the error event to bubble to the document.
  documentToTrack.addEventListener(
    "astro:hydration-error",
    (event) => {
      if (isIsland(event.target)) failures.add(event.target);
    },
    true,
  );
  documentToTrack.addEventListener(
    "astro:hydrate",
    (event) => {
      if (isIsland(event.target)) failures.delete(event.target);
    },
    true,
  );
}

/** Whether Astro reported a failure for this exact DOM instance. */
export function hasIslandHydrationFailed(element: Element): boolean {
  return (element.ownerDocument as TrackedDocument)[FAILURES_KEY]?.has(element) ?? false;
}

function isIsland(target: EventTarget | null): target is Element {
  return target instanceof Element && target.localName === "astro-island";
}
