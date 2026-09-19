/** Story of CardButton with its native button interaction. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, fn } from "storybook/test";

import { CardButton } from "./CardButton.tsx";

const meta = {
  title: "Primitives/CardButton",
  component: CardButton,
} satisfies Meta<typeof CardButton>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: { children: "Open Routes", onClick: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
