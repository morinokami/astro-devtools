/** Gallery of every panel icon, in the order icons.tsx declares them. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import type { IconComponent } from "./icons.tsx";

import {
  AstroLogoIcon,
  BugIcon,
  FunctionIcon,
  PreactLogoIcon,
  ReactLogoIcon,
  SitemapIcon,
  SolidLogoIcon,
  StarIcon,
  SvelteLogoIcon,
  ViteLogoIcon,
  VueLogoIcon,
} from "./icons.tsx";

const meta = {
  title: "Assets/Icons",
} satisfies Meta;

export default meta;

export const Gallery: StoryObj = {
  render: () => (
    <div class="grid grid-cols-4 gap-6 text-body">
      {ICONS.map(([name, Icon]) => (
        <figure key={name} class="flex flex-col items-center gap-2">
          <Icon class="size-8" />
          <figcaption class="font-mono text-xs text-muted">{name}</figcaption>
        </figure>
      ))}
    </div>
  ),
};

/** Display order: the dock glyphs first, then the framework logomarks. */
const ICONS: [string, IconComponent][] = [
  ["AstroLogoIcon", AstroLogoIcon],
  ["SitemapIcon", SitemapIcon],
  ["StarIcon", StarIcon],
  ["BugIcon", BugIcon],
  ["ViteLogoIcon", ViteLogoIcon],
  ["FunctionIcon", FunctionIcon],
  ["PreactLogoIcon", PreactLogoIcon],
  ["ReactLogoIcon", ReactLogoIcon],
  ["SolidLogoIcon", SolidLogoIcon],
  ["SvelteLogoIcon", SvelteLogoIcon],
  ["VueLogoIcon", VueLogoIcon],
];
