/** Story of the PanelCard static container with its CardTitle heading. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { Caption } from "./Caption.tsx";
import { CardTitle, PanelCard } from "./PanelCard.tsx";

const meta = {
  title: "Panel/PanelCard",
  component: PanelCard,
} satisfies Meta<typeof PanelCard>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: {
    children: (
      <>
        <CardTitle>Islands</CardTitle>
        <Caption>Interactive components hydrated on this page.</Caption>
      </>
    ),
  },
};
