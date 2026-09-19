/**
 * Browser entry point injected into every page during `astro dev`.
 *
 * Astro does not pass its rendered pages through Vite's `transformIndexHtml`
 * hook. Mirror Vite DevTools' own runtime injection so the hub-served,
 * self-contained embedded client stays outside Vite's module graph.
 *
 * Island tracking also starts here, at page load, because the Islands panel
 * may open only after the evidence it needs is gone: client-island hydration
 * failures are recorded as Astro reports them, and server-island Resource
 * Timing entries are copied before the browser's entry buffer overflows,
 * together with the moment each view transition starts swapping, which
 * separates the current page's island requests from the previous page's.
 */
import { installClientIslandHydrationTracking } from "./client/features/islands/client-island-hydration.ts";
import { installServerIslandNavigationTracking } from "./client/features/islands/server-island-navigation.ts";

installClientIslandHydrationTracking();

const devtoolsScript = document.createElement("script");
devtoolsScript.type = "module";
devtoolsScript.src = "/__devtools/embedded.js";
document.body.appendChild(devtoolsScript);

// Track navigation timing from page load so later island scans use the
// correct Resource Timing entries.
installServerIslandNavigationTracking();
