/** Stories of the StateNote empty-state title and explanation: plain, and ending on a docs link. */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { DocsLink } from "./DocsLink.tsx";
import { StateNote } from "./StateNote.tsx";

const meta = {
  title: "Feedback/StateNote",
  component: StateNote,
} satisfies Meta<typeof StateNote>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  args: {
    title: "No islands on this page.",
    children: "Did you forget to add a client directive to your interactive UI component?",
  },
};

export const WithDocsLink: StoryObj<typeof meta> = {
  args: {
    title: "Islands are page-scoped.",
    children: (
      <>
        This panel reads the islands of the page it is opened on, so it only works from the dock
        embedded in your site.{" "}
        <DocsLink href="https://docs.astro.build/en/concepts/islands/">
          Learn about islands
        </DocsLink>
      </>
    ),
  },
};
