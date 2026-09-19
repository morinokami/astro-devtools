/** Story of the Select native choice control, offering a schema default beside concrete values. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, fn } from "storybook/test";

import { Select } from "./Select.tsx";

const meta = {
  title: "Primitives/Select",
  component: Select,
} satisfies Meta<typeof Select>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: {
    "aria-label": "enabled",
    onChange: fn(),
    children: (
      <>
        <option value="">default: true</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </>
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    const select = canvas.getByRole("combobox", { name: "enabled" });
    await userEvent.selectOptions(select, "false");
    await expect(select).toHaveValue("false");
    await expect(args.onChange).toHaveBeenCalledOnce();
  },
};
