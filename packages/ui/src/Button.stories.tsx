/** Stories of the Button accent control: default, inactive, and form-submit states. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, fn } from "storybook/test";

import { Button } from "./Button.tsx";

const meta = {
  title: "Primitives/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: { children: "Call action", onClick: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Inactive: StoryObj<typeof meta> = {
  args: { children: "Call action", inactive: true, onClick: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

// The story-module spy would keep a submit recorded across story runs, so
// `play` clears it first. Its `preventDefault` keeps a failing run (a real
// submit) from navigating the test page away.
const onFormSubmit = fn((event: Event) => event.preventDefault());

export const InactiveSubmit: StoryObj<typeof meta> = {
  args: { children: "Call action", inactive: true, type: "submit", onClick: fn() },
  render: (args) => (
    <form onSubmit={onFormSubmit}>
      <Button {...args} />
    </form>
  ),
  play: async ({ args, canvas, userEvent }) => {
    onFormSubmit.mockClear();
    await userEvent.click(canvas.getByRole("button"));
    await expect(onFormSubmit).not.toHaveBeenCalled();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
