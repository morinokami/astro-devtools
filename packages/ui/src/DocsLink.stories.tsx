/** Story of the DocsLink external documentation link. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect } from "storybook/test";

import { DocsLink } from "./DocsLink.tsx";

const meta = {
  title: "Primitives/DocsLink",
  component: DocsLink,
} satisfies Meta<typeof DocsLink>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: {
    href: "https://docs.astro.build/en/concepts/islands/",
    children: "Learn about islands",
  },
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: "Learn about islands" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
  },
};
