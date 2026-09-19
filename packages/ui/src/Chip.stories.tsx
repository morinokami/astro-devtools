/** Stories of the Chip filter toggle: unpressed and pressed states. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, fn } from "storybook/test";

import { Chip } from "./Chip.tsx";

const meta = {
  title: "Primitives/Chip",
  component: Chip,
} satisfies Meta<typeof Chip>;

export default meta;

export const Unpressed: StoryObj<typeof meta> = {
  args: { pressed: false, onClick: fn(), children: "Pages 8" },
  play: async ({ args, canvas, userEvent }) => {
    const chip = canvas.getByRole("button", { pressed: false });
    await userEvent.click(chip);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Pressed: StoryObj<typeof meta> = {
  args: { pressed: true, onClick: fn(), children: "Pages 8" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { pressed: true })).toBeVisible();
  },
};
