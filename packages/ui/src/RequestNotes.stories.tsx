/**
 * Stories of the RequestNotes lifecycle notes. A ready request keeps an
 * empty live region mounted, so every request transition can be announced.
 */

import type { Meta, StoryObj } from "@storybook/preact-vite";

import { useState } from "preact/hooks";
import { expect, fn, waitFor } from "storybook/test";

import type { RequestResult } from "./RequestNotes.tsx";

import { RequestNotes } from "./RequestNotes.tsx";

const meta = {
  title: "Feedback/RequestNotes",
  component: RequestNotes,
} satisfies Meta<typeof RequestNotes>;

export default meta;

export const Loading: StoryObj<typeof meta> = {
  args: {
    label: "routes",
    state: { status: "loading", data: undefined, error: undefined, refresh: fn() },
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Loading routes…"));
  },
};

export const Refreshing: StoryObj<typeof meta> = {
  args: {
    label: "routes",
    state: { status: "loading", data: [], error: undefined, refresh: fn() },
  },
};

export const LoadError: StoryObj<typeof meta> = {
  args: {
    label: "routes",
    state: {
      status: "error",
      data: undefined,
      error: new Error("The dev server closed the connection."),
      refresh: fn(),
    },
  },
};

export const RefreshError: StoryObj<typeof meta> = {
  args: {
    label: "routes",
    state: {
      status: "error",
      data: [],
      error: new Error("The dev server closed the connection."),
      refresh: fn(),
    },
  },
};

export const Ready: StoryObj<typeof meta> = {
  args: {
    label: "routes",
    state: { status: "ready", data: [], error: undefined, refresh: fn() },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status").textContent).toBe("");
  },
};

export const ReadyToRefreshing: StoryObj<typeof meta> = {
  args: Ready.args,
  render: () => <RequestLifecycle />,
  play: async ({ canvas, userEvent }) => {
    const status = canvas.getByRole("status");
    await expect(status.textContent).toBe("");

    await userEvent.click(canvas.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(status).toHaveTextContent("Refreshing routes…"));
    await expect(canvas.getByRole("status")).toBe(status);
  },
};

/** A ready request that can enter a stale refresh without replacing its live region. */
function RequestLifecycle() {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = (): void => setRefreshing(true);
  const state: RequestResult<unknown> = refreshing
    ? { status: "loading", data: [], error: undefined, refresh }
    : { status: "ready", data: [], error: undefined, refresh };
  return (
    <>
      <button type="button" onClick={refresh}>
        Refresh
      </button>
      <RequestNotes state={state} label="routes" />
    </>
  );
}
