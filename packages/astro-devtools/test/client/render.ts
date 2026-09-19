/** Mount Preact client tests under `document.body` and unmount every root during cleanup. */

import type { ComponentChild } from "preact";

import { render } from "preact";
import { act } from "preact/test-utils";

const mountedContainers = new Set<HTMLElement>();

/** Render a component and flush its effects before returning the container. */
export async function renderTestComponent(vnode: ComponentChild): Promise<HTMLElement> {
  const container = document.createElement("div");
  mountedContainers.add(container);
  document.body.append(container);
  await act(() => render(vnode, container));
  return container;
}

/** Update an existing test root and flush the effects caused by that render. */
export async function rerenderTestComponent(
  vnode: ComponentChild,
  container: HTMLElement,
): Promise<void> {
  if (!mountedContainers.has(container)) throw new Error("Cannot rerender an untracked test root.");
  await act(() => render(vnode, container));
}

/** Unmount all roots created by `renderTestComponent`, then reset the test body. */
export async function cleanupTestComponents(): Promise<void> {
  await act(() => {
    for (const container of mountedContainers) render(null, container);
  });
  mountedContainers.clear();
  document.body.replaceChildren();
}
