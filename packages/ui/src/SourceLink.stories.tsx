/** Story of the SourceLink button styled as a dashed-underline file link. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, fn } from "storybook/test";

import { SourceLink } from "./SourceLink.tsx";

const meta = {
  title: "Primitives/SourceLink",
  component: SourceLink,
} satisfies Meta<typeof SourceLink>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: {
    class: "font-mono",
    title: "src/pages/index.astro",
    onClick: fn(),
    children: "src/pages/index.astro",
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
