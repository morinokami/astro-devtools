/**
 * Story of the StatusAnnouncer live region. It records the initial empty
 * commit before the `sr-only` announcement is published.
 */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect, waitFor } from "storybook/test";

import { StatusAnnouncer } from "./StatusAnnouncer.tsx";

const meta = {
  title: "Feedback/StatusAnnouncer",
  component: StatusAnnouncer,
} satisfies Meta<typeof StatusAnnouncer>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: { children: "12 routes shown." },
  render: (args) => (
    <div
      data-testid="status-probe"
      ref={(element) => {
        if (element !== null && element.dataset.initialText === undefined) {
          element.dataset.initialText = element.querySelector('[role="status"]')?.textContent ?? "";
        }
      }}
    >
      <StatusAnnouncer>{args.children}</StatusAnnouncer>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("status-probe")).toHaveAttribute("data-initial-text", "");
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("12 routes shown."));
  },
};
