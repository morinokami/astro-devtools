/** Story of the panel scaffolding: a PanelViewport wrapping a PanelContent column of cards. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { Caption } from "./Caption.tsx";
import { CardTitle, PanelCard } from "./PanelCard.tsx";
import { PanelContent, PanelViewport } from "./PanelLayout.tsx";

const meta = {
  title: "Panel/PanelLayout",
  component: PanelViewport,
} satisfies Meta<typeof PanelViewport>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: {
    class: "h-96 text-sm",
    children: (
      <PanelContent class="gap-4">
        <PanelCard>
          <CardTitle>Routes</CardTitle>
          <Caption>12 routes shown.</Caption>
        </PanelCard>
        <PanelCard>
          <CardTitle>Islands</CardTitle>
          <Caption>3 islands hydrated.</Caption>
        </PanelCard>
      </PanelContent>
    ),
  },
};
