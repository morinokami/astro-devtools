/** Story of CardLink as a labeled external destination. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, fn } from "storybook/test";

import { CardLink } from "./CardLink.tsx";

const meta = {
  title: "Primitives/CardLink",
  component: CardLink,
} satisfies Meta<typeof CardLink>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: {
    href: "https://docs.astro.build/",
    "aria-label": "Astro documentation",
    children: "docs.astro.build",
  },
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: "Astro documentation" });
    await expect(link).toHaveAttribute("href", "https://docs.astro.build/");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
  },
};

export const UnsafeUrl: StoryObj<typeof meta> = {
  args: {
    href: "javascript:alert(1)",
    id: "unsafe-card",
    "aria-label": "Unsafe destination",
    "data-testid": "unsafe-card",
    onClick: fn(),
    children: "Unsafe destination",
  },
  play: async ({ args, canvas, userEvent }) => {
    const fallback = canvas.getByRole("group", { name: "Unsafe destination" });
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(fallback).toHaveAttribute("id", "unsafe-card");
    await expect(fallback).toHaveAttribute("data-testid", "unsafe-card");
    await expect(fallback).not.toHaveAttribute("href");
    await userEvent.click(fallback);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
