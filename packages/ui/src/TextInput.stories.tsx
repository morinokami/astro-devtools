/**
 * Stories of the TextInput single-line control: a form field whose placeholder
 * carries a default, and the `sm` size that shares a toolbar row with chips.
 */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, fn } from "storybook/test";

import { Chip } from "./Chip.tsx";
import { TextInput } from "./TextInput.tsx";

const meta = {
  title: "Primitives/TextInput",
  component: TextInput,
} satisfies Meta<typeof TextInput>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: { "aria-label": "count", placeholder: "default: 10", onInput: fn() },
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "count" });

    // The placeholder is readable text, not the browser's half-transparent
    // version of the control's own color.
    const muted = document.createElement("span");
    muted.style.color = "var(--color-muted)";
    input.after(muted);
    await expect(getComputedStyle(input, "::placeholder").color).toBe(
      getComputedStyle(muted).color,
    );
    muted.remove();

    await userEvent.type(input, "42");
    await expect(input).toHaveValue("42");
    await expect(args.onInput).toHaveBeenCalled();
  },
};

export const BesideChips: StoryObj<typeof meta> = {
  args: {
    type: "search",
    size: "sm",
    "aria-label": "Filter routes",
    placeholder: "Filter routes…",
  },
  render: (args) => (
    <div class="flex items-center gap-2 p-4">
      <Chip pressed={false} onClick={() => {}}>
        Pages 8
      </Chip>
      <TextInput {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const chip = canvas.getByRole("button", { name: "Pages 8" });
    const input = canvas.getByRole("searchbox", { name: "Filter routes" });
    await expect(input.getBoundingClientRect().height).toBe(chip.getBoundingClientRect().height);
  },
};
