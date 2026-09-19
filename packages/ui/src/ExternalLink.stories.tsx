/**
 * Stories of ExternalLink's two rules: a new tab without a referrer for
 * HTTP(S) and site paths, and an inert anchor for anything else.
 */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, fn } from "storybook/test";

import { ExternalLink } from "./ExternalLink.tsx";

const meta = {
  title: "Primitives/ExternalLink",
  component: ExternalLink,
  args: { class: "text-bright underline" },
} satisfies Meta<typeof ExternalLink>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: { href: "https://github.com/morinokami/astro-devtools", children: "Star on GitHub" },
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: "Star on GitHub" });
    await expect(link).toHaveAttribute("href", "https://github.com/morinokami/astro-devtools");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
  },
};

export const SitePath: StoryObj<typeof meta> = {
  args: { href: "/docs/about/", children: "/about" },
  play: async ({ canvas }) => {
    // A path resolves against the page, so it navigates; it is kept as written.
    const link = canvas.getByRole("link", { name: "/about" });
    await expect(link).toHaveAttribute("href", "/docs/about/");
    await expect(link).toHaveAttribute("target", "_blank");
  },
};

export const UnsafeUrl: StoryObj<typeof meta> = {
  args: { href: "javascript:alert(1)", onClick: fn(), children: "Unsafe destination" },
  play: async ({ args, canvas, userEvent }) => {
    const anchor = canvas.getByText("Unsafe destination");
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(anchor).not.toHaveAttribute("href");
    await expect(anchor).not.toHaveAttribute("target");
    await expect(anchor).not.toHaveAttribute("rel");
    await userEvent.click(anchor);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
