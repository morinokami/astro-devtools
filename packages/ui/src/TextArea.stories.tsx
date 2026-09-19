/** Story of the TextArea multi-line control, as the free-form JSON input of an action. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, fn } from "storybook/test";

import { TextArea } from "./TextArea.tsx";

const meta = {
  title: "Primitives/TextArea",
  component: TextArea,
} satisfies Meta<typeof TextArea>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: {
    "aria-label": "Input for greet",
    placeholder: '{ "name": "Ada" } — leave empty to send no input',
    rows: 3,
    spellcheck: false,
    class: "w-full font-mono",
    onInput: fn(),
  },
  play: async ({ args, canvas, userEvent }) => {
    const textarea = canvas.getByRole("textbox", { name: "Input for greet" });
    await userEvent.type(textarea, "[[1]");
    await expect(textarea).toHaveValue("[1]");
    await expect(args.onInput).toHaveBeenCalled();
  },
};
