import alpinejs from "@astrojs/alpinejs";
import node from "@astrojs/node";
import preact from "@astrojs/preact";
import react from "@astrojs/react";
import solid from "@astrojs/solid-js";
import svelte from "@astrojs/svelte";
import vue from "@astrojs/vue";
import astroDevtools from "astro-devtools";
import { defineConfig } from "astro/config";

import playgroundExtension from "./devtools-extension.ts";

// https://astro.build/config
export default defineConfig({
  // The adapter keeps `astro build` working with the on-demand actions
  // endpoint; pages stay prerendered (output defaults to "static").
  adapter: node({ mode: "standalone" }),
  // One config redirect, so the Routes panel's Redirects section has data.
  redirects: {
    "/old-blog": "/blog/hello-world",
  },
  // Minimal i18n setup for the Routes panel: `/ja` is a real locale
  // variant of `/`, every other page falls back to its `en` version.
  // Astro still generates a `/ja` fallback for `/`, so `astro build`
  // warns that it "conflicts with higher priority route `/ja`" — the
  // real page winning is the point, so the warning is expected.
  i18n: {
    locales: ["en", "ja"],
    defaultLocale: "en",
    fallback: { ja: "en" },
  },
  // The renderer integrations pre-bundle their own client entrypoints, but
  // @astrojs/alpinejs only injects `import Alpine from "alpinejs"` into
  // every page, so Vite discovers alpinejs on the first page load and
  // reloads mid-session ("optimized dependencies changed") — which the
  // dock e2e sees as fetch errors. Pre-bundling it keeps startup atomic.
  vite: {
    optimizeDeps: { include: ["alpinejs"] },
  },
  // Every official UI framework, so the Islands panel's framework logos
  // can all be seen live (the /frameworks page renders one island each).
  // Three JSX frameworks coexist, so each one names the component
  // directory it owns; Svelte and Vue are recognized by their extensions.
  // Alpine is the odd one out: it registers no renderer and injects one
  // global script instead, so it never appears as an island.
  integrations: [
    preact({ include: ["**/preact/*"] }),
    react({ include: ["**/react/*"] }),
    solid({ include: ["**/solid/*"] }),
    svelte(),
    vue(),
    alpinejs(),
    playgroundExtension(),
    astroDevtools(),
  ],
});
