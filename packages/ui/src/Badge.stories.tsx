/** Stories of the Badge status label: one story per tone, labeled as the panels use them. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { Badge } from "./Badge.tsx";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
} satisfies Meta<typeof Badge>;

export default meta;

export const Purple: StoryObj<typeof meta> = {
  args: { tone: "purple", children: "client:load" },
};

export const Gray: StoryObj<typeof meta> = {
  args: { tone: "gray", children: "pending" },
};

export const Red: StoryObj<typeof meta> = {
  args: { tone: "red", children: "failed · 500" },
};

export const Green: StoryObj<typeof meta> = {
  args: { tone: "green", children: "hydrated" },
};

export const Yellow: StoryObj<typeof meta> = {
  args: { tone: "yellow", children: "needs adapter" },
};

export const Blue: StoryObj<typeof meta> = {
  args: { tone: "blue", children: "server" },
};
