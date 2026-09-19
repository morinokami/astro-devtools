/** Stories of the Caption supporting text: a block under a title, and inline beside a badge. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect } from "storybook/test";

import { Badge } from "./Badge.tsx";
import { Caption } from "./Caption.tsx";

const meta = {
  title: "Primitives/Caption",
  component: Caption,
} satisfies Meta<typeof Caption>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: {
    children:
      "Expand an action to call it. The call POSTs to the action's real dev-server endpoint.",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^Expand an action/).tagName).toBe("P");
  },
};

export const Inline: StoryObj<typeof meta> = {
  args: { as: "span", children: "action returned" },
  render: (args) => (
    <div class="flex items-center gap-2">
      <Badge tone="green">200</Badge>
      <Caption {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("action returned").tagName).toBe("SPAN");
  },
};
