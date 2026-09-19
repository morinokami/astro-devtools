/**
 * The single definition of "the page changed" for Astro client navigation.
 * Everything that re-reads the page after a soft navigation subscribes
 * here, so Astro renaming an event — or a third one becoming necessary —
 * is a one-place change.
 */

const PAGE_CHANGE_EVENTS = ["astro:page-load", "astro:after-swap"] as const;

/**
 * Invoke `listener` after Astro swaps or finishes loading a page; returns the
 * unsubscriber. One `AbortSignal` covers every registration, so the event list
 * above is the only place that enumerates them — unsubscribing cannot fall out
 * of step with subscribing. Subscribe a given function once: `addEventListener`
 * ignores a repeated listener, so a second subscription of the same function
 * would ride the first one's signal and its own unsubscriber would do nothing.
 */
export function onAstroPageChange(listener: () => void): () => void {
  const subscription = new AbortController();
  for (const event of PAGE_CHANGE_EVENTS) {
    document.addEventListener(event, listener, { signal: subscription.signal });
  }
  return () => subscription.abort();
}
