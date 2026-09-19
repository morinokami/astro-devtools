/**
 * Stories of RowList and Row: list rows that keep their list semantics, and
 * `div` rows of a description list. Both check the divider between rows.
 */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { expect } from "storybook/test";

import { CardTitle, PanelCard } from "./PanelCard.tsx";
import { Row, RowList } from "./RowList.tsx";

const meta = {
  title: "Panel/RowList",
  component: RowList,
} satisfies Meta<typeof RowList>;

export default meta;

const ROUTES = ["/", "/about", "/blog/[slug]"];

export const Default: StoryObj<typeof meta> = {
  args: {
    children: ROUTES.map((route) => (
      <Row key={route} class="px-2 py-1.75 font-mono text-bright">
        {route}
      </Row>
    )),
  },
  render: (args) => (
    <PanelCard>
      <CardTitle>Pages (3)</CardTitle>
      <RowList {...args} />
    </PanelCard>
  ),
  play: async ({ canvas }) => {
    // The role is explicit, so it survives preflight's `list-style: none`.
    const list = canvas.getByRole("list");
    await expect(list).toHaveAttribute("role", "list");
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    await expectDividers(rowsOf(list));
  },
};

export const DescriptionRows: StoryObj<typeof meta> = {
  args: Default.args,
  render: () => (
    <PanelCard>
      <CardTitle>Astro config</CardTitle>
      <dl data-testid="rows">
        {["output", "base", "trailingSlash"].map((key) => (
          <Row key={key} as="div" class="grid grid-cols-2 px-2 py-1.75 font-mono">
            <dt class="text-muted">{key}</dt>
            <dd class="text-bright">static</dd>
          </Row>
        ))}
      </dl>
    </PanelCard>
  ),
  play: async ({ canvas }) => {
    await expectDividers(rowsOf(canvas.getByTestId("rows")));
  },
};

/** The direct children of a list element, which are its rows. */
function rowsOf(list: HTMLElement): HTMLElement[] {
  return [...list.children] as HTMLElement[];
}

/** Every row but the first draws a divider above itself. */
async function expectDividers(rows: HTMLElement[]): Promise<void> {
  await expect(rows).toHaveLength(3);
  const widths = rows.map((row) => getComputedStyle(row).borderTopWidth);
  await expect(widths).toEqual(["0px", "1px", "1px"]);
}
