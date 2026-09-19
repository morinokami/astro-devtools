/** Story of the SourceFileCard, titling one source file that opens on click. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, fn } from "storybook/test";

import { SourceFileCard } from "./SourceFileCard.tsx";

const meta = {
  title: "Panel/SourceFileCard",
  component: SourceFileCard,
} satisfies Meta<typeof SourceFileCard>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: { title: "Config file", file: "astro.config.mjs", onOpen: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onOpen).toHaveBeenCalledOnce();
  },
};
