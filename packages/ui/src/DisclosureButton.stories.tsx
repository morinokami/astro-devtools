/**
 * Stories of the DisclosureButton: the collapsed and expanded halves of its
 * ARIA contract, the marker on either side of the label, and a live toggle.
 */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { useState } from "preact/hooks";
import { expect } from "storybook/test";

import { DisclosureButton } from "./DisclosureButton.tsx";

const REGION_ID = "disclosure-region";

const meta = {
  title: "Primitives/DisclosureButton",
  component: DisclosureButton,
} satisfies Meta<typeof DisclosureButton>;

export default meta;

export const Collapsed: StoryObj<typeof meta> = {
  args: { expanded: false, controls: REGION_ID, children: "feedback.submit" },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: "feedback.submit" });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    // Nothing with that id is mounted, so nothing may be referenced.
    await expect(button).not.toHaveAttribute("aria-controls");
  },
};

export const Expanded: StoryObj<typeof meta> = {
  args: { expanded: true, controls: REGION_ID, children: "feedback.submit" },
  render: (args) => (
    <>
      <DisclosureButton {...args} />
      <p id={REGION_ID}>The request editor.</p>
    </>
  ),
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: "feedback.submit" });
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(button).toHaveAttribute("aria-controls", REGION_ID);
  },
};

export const MarkerAtEnd: StoryObj<typeof meta> = {
  args: { expanded: false, controls: REGION_ID, marker: "end", children: "Internal (3)" },
  play: async ({ canvas }) => {
    // The marker is decoration: it follows the label without joining the name.
    const button = canvas.getByRole("button", { name: "Internal (3)" });
    await expect(button.lastElementChild).toHaveTextContent("▶");
    await expect(button.lastElementChild).toHaveAttribute("aria-hidden", "true");
  },
};

export const Toggles: StoryObj<typeof meta> = {
  args: Collapsed.args,
  render: () => <Disclosure />,
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole("button", { name: "feedback.submit" });

    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-controls", REGION_ID);
    await expect(canvas.getByText("The request editor.")).toHaveAttribute("id", REGION_ID);

    await userEvent.click(button);
    await expect(button).not.toHaveAttribute("aria-controls");
    await expect(canvas.queryByText("The request editor.")).not.toBeInTheDocument();
  },
};

/** A region that is unmounted while collapsed, as the panels do it. */
function Disclosure() {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <DisclosureButton
        expanded={expanded}
        controls={REGION_ID}
        onClick={() => setExpanded((current) => !current)}
      >
        feedback.submit
      </DisclosureButton>
      {expanded && <p id={REGION_ID}>The request editor.</p>}
    </>
  );
}
