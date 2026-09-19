import { describe, expect, it } from "vite-plus/test";

import { ACCENT_COLOR, ASTRO_LOGO_ICON, resolveBranding } from "../src/branding.ts";

describe("resolveBranding", () => {
  it("brands the host as Astro DevTools by default", () => {
    const branding = resolveBranding();

    expect(branding.productName).toBe("Astro DevTools");
    expect(branding.windowTitle).toBe("Astro DevTools");
    expect(branding.primaryColor).toBe(ACCENT_COLOR);
    expect(branding.favicon).toBe(ASTRO_LOGO_ICON);
    expect(branding.tagline).toContain("Vite DevTools");
  });

  it("swaps only the body color between the logo schemes", () => {
    const logo = resolveBranding().logo as { light: string; dark: string };
    const light = decodeURIComponent(logo.light);
    const dark = decodeURIComponent(logo.dark);

    expect(light).toContain('fill="#17191E"');
    expect(dark).toContain('fill="#fff"');
    // Both keep Astro's brand gradient for the flame.
    expect(light).toContain("#D83333");
    expect(dark).toContain("#D83333");
    // The theme pair needs no embedded media query; the favicon does.
    expect(light).not.toContain("prefers-color-scheme");
    expect(decodeURIComponent(ASTRO_LOGO_ICON)).toContain("prefers-color-scheme");
  });

  it("suppresses Vite's wordmark so the client composes logo + name", () => {
    // "" is a set field — it overrides upstream's default wordmark images
    // in the field-by-field merge — that hub-ui still treats as absent.
    expect(resolveBranding().wordmark).toBe("");
  });

  it("lets user-set fields win over the integration's defaults", () => {
    const branding = resolveBranding({ productName: "My DevTools", primaryColor: "#123456" });

    expect(branding.productName).toBe("My DevTools");
    expect(branding.primaryColor).toBe("#123456");
    expect(branding.windowTitle).toBe("Astro DevTools");
  });

  it("ignores explicitly undefined overrides", () => {
    const branding = resolveBranding({ productName: undefined });

    expect(branding.productName).toBe("Astro DevTools");
  });
});
