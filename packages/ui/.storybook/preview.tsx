/** Storybook preview: recreates the color scheme and named container supplied by the real panel host. */

import type { PreactRenderer, Preview } from "@storybook/preact-vite";

import { withThemeByDataAttribute } from "@storybook/addon-themes";

import "./preview.css";

const preview: Preview = {
  decorators: [
    withThemeByDataAttribute<PreactRenderer>({
      themes: {
        light: "light",
        dark: "dark",
      },
      // The story-test run renders every story once per theme by setting
      // this variable per browser instance (../vite.config.ts); Storybook
      // itself leaves it unset and starts in light, with the toolbar to switch.
      defaultTheme: import.meta.env.STORYBOOK_THEME === "dark" ? "dark" : "light",
      attributeName: "data-color-scheme",
    }),
    // Preact stories are plain functions returning `string | Node | Element`, not components: call, don't mount.
    (Story) => <div class="storybook-panel-host">{Story()}</div>,
  ],
  parameters: {
    // Accessibility violations fail the story-test run, not just the panel.
    a11y: { test: "error" },
    layout: "fullscreen",
    options: {
      storySort: {
        order: ["Primitives", "Panel", "Feedback", "Assets"],
        method: "alphabetical",
      },
    },
  },
};

export default preview;
