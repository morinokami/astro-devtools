import type { DevToolsConfig } from "@vitejs/devtools/config";

/** The `branding` slice of Vite's `devtools` option. */
type DevtoolsBranding = NonNullable<DevToolsConfig["branding"]>;

/**
 * Astro logo from astro@7.1.2 (MIT, https://github.com/withastro/astro):
 * packages/astro/src/runtime/client/dev-toolbar/ui-library/icons.ts. A JSX
 * copy exists in `@astro-devtools/ui` (icons.tsx); these are data URIs because the
 * dock renders data icons with their original colors — panel CSS cannot
 * style an image, so the body color must live inside the SVG itself.
 *
 * The flame keeps Astro's brand gradient in both schemes; only the body
 * (drawn twice: once under the gradient, once as the rocket) flips between
 * white-on-dark and Astro's own ink color on light.
 */
const BODY_ON_DARK = "#fff";
const BODY_ON_LIGHT = "#17191E";
const FLAME_PATH =
  "M27.6 91.1c-4.8-4.4-6.3-13.7-4.2-20.4 3.5 4.2 8.3 5.6 13.3 6.3 7.7 1.2 15.3.8 22.5-2.8l2.5-1.4c.7 2 .9 3.9.6 5.9-.6 4.9-3 8.7-6.9 11.5-1.5 1.2-3.2 2.2-4.8 3.3-4.9 3.3-6.2 7.2-4.4 12.9l.2.6a13 13 0 0 1-5.7-5 13.8 13.8 0 0 1-2.2-7.4c0-1.3 0-2.7-.2-4-.5-3.1-2-4.6-4.8-4.7a5.5 5.5 0 0 0-5.7 4.6l-.2.6Z";
const ROCKET_PATH =
  "M0 69.6s14.3-7 28.7-7l10.8-33.5c.4-1.6 1.6-2.7 3-2.7 1.2 0 2.4 1.1 2.8 2.7l10.9 33.5c17 0 28.6 7 28.6 7L60.5 3.2c-.7-2-2-3.2-3.5-3.2H27.8c-1.6 0-2.7 1.3-3.4 3.2L0 69.6Z";
const GRADIENT = `<linearGradient id="a" x1="22.5" x2="69.1" y1="107" y2="84.9" gradientUnits="userSpaceOnUse"><stop stop-color="#D83333"/><stop offset="1" stop-color="#F041FF"/></linearGradient>`;

function astroLogoSvg(head: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 85 107" aria-hidden="true">${head}<path fill="${body}" d="${FLAME_PATH}"/><path fill="url(#a)" d="${FLAME_PATH}"/><path fill="${body}" d="${ROCKET_PATH}"/><defs>${GRADIENT}</defs></svg>`;
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Self-adapting variant for surfaces that follow the OS color scheme and
 * cannot be swapped per theme: the dock group icon and the favicon.
 */
export const ASTRO_LOGO_ICON = toDataUri(
  astroLogoSvg(
    `<style>@media (prefers-color-scheme:light){path[fill="${BODY_ON_DARK}"]{fill:${BODY_ON_LIGHT}}}</style>`,
    BODY_ON_DARK,
  ),
);

// The branding logo gets explicit per-scheme variants instead: hub-ui picks
// `light`/`dark` from its own theme toggle (`resolveLogo` in its
// state/branding.ts), which can disagree with `prefers-color-scheme`.
const ASTRO_LOGO_LIGHT = toDataUri(astroLogoSvg("", BODY_ON_LIGHT));
const ASTRO_LOGO_DARK = toDataUri(astroLogoSvg("", BODY_ON_DARK));

/** Midpoint of Astro's brand gradient, used where the UI needs one color. */
export const ACCENT_COLOR = "#E43A99";

/**
 * This integration's default DevTools identity. Vite DevTools merges the
 * configured branding field-by-field over its own defaults, so every field
 * the rebrand cares about must be set here — anything left out stays Vite's.
 */
function astroDevtoolsBranding(): DevtoolsBranding {
  return {
    productName: "Astro DevTools",
    primaryColor: ACCENT_COLOR,
    logo: { light: ASTRO_LOGO_LIGHT, dark: ASTRO_LOGO_DARK },
    // An empty string is a set field, so it overrides Vite's wordmark
    // images in the upstream merge, yet hub-ui still treats it as absent
    // and composes the logo with the product name instead.
    wordmark: "",
    favicon: ASTRO_LOGO_ICON,
    tagline: "DevTools for Astro, built on Vite DevTools",
    windowTitle: "Astro DevTools",
  };
}

/**
 * Merge the branding the user set in `vite.devtools` over the Astro
 * defaults, mirroring upstream `resolveBranding()`: only keys the user
 * actually sets win, and an explicit `undefined` never clobbers a default.
 */
export function resolveBranding(overrides?: DevtoolsBranding): DevtoolsBranding {
  const branding = astroDevtoolsBranding();
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value !== undefined) branding[key as keyof DevtoolsBranding] = value as never;
  }
  return branding;
}
