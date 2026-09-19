// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { OMITTED_VALUE } from "../../../../src/client/features/actions/action-form.ts";
import { ActionRow } from "../../../../src/client/features/actions/ActionRow.tsx";
import { cleanupTestComponents, renderTestComponent, rerenderTestComponent } from "../../render.ts";

afterEach(cleanupTestComponents);

const PROPS = {
  qualifiedName: "feedback.submit",
  fields: undefined,
  endpoint: "/_actions/feedback.submit",
  expanded: true,
  draft: { fields: {}, json: "" },
  onToggle: () => {},
  onFieldInput: () => {},
  onJsonInput: () => {},
} as const;

const callButton = (container: HTMLElement): HTMLButtonElement | undefined =>
  [...container.querySelectorAll("button")].find((button) => button.textContent === "Call action");

describe("ActionRow", () => {
  it("renders generated fields instead of the JSON textarea", async () => {
    const container = await renderTestComponent(
      <ActionRow
        {...PROPS}
        fields={[{ name: "message", kind: "text", required: true }]}
        requestState={undefined}
        onCall={() => {}}
      />,
    );

    expect(container.querySelector('input[name="message"]')).not.toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("starts an untouched generated field as omitted, not as the empty string", async () => {
    // The draft has no entry for a field nobody typed in, and the control has
    // to read that as omission — the empty string is a value of its own.
    const container = await renderTestComponent(
      <ActionRow
        {...PROPS}
        fields={[{ name: "message", kind: "text", required: true }]}
        requestState={undefined}
        onCall={() => {}}
      />,
    );

    expect(
      container.querySelector<HTMLSelectElement>('select[aria-label="message value"]')?.value,
    ).toBe(OMITTED_VALUE);
  });

  it("falls back to raw JSON when fields cannot be generated", async () => {
    const container = await renderTestComponent(
      <ActionRow {...PROPS} requestState={undefined} onCall={() => {}} />,
    );

    expect(container.querySelector("textarea")).not.toBeNull();
  });

  it("refuses a pending call without taking the button out of the tab order", async () => {
    const onCall = vi.fn();
    const container = await renderTestComponent(
      <ActionRow {...PROPS} requestState={{ kind: "pending" }} onCall={onCall} />,
    );

    expect(container.firstElementChild?.tagName).toBe("LI");
    const button = callButton(container);
    // A native `disabled` would blur the button the user just activated and
    // drop focus out of the panel's shadow root; `aria-disabled` does not.
    expect(button?.getAttribute("aria-disabled")).toBe("true");
    expect(button?.disabled).toBe(false);
    button?.focus();
    expect(document.activeElement).toBe(button);

    button?.click();
    expect(onCall).not.toHaveBeenCalled();
  });

  it("calls the action while no request is in flight", async () => {
    const onCall = vi.fn();
    const container = await renderTestComponent(
      <ActionRow {...PROPS} requestState={undefined} onCall={onCall} />,
    );
    const button = callButton(container);

    expect(button?.hasAttribute("aria-disabled")).toBe(false);
    button?.click();
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it("submits the editor as a form, without native validation in the way", async () => {
    const onCall = vi.fn();
    const container = await renderTestComponent(
      <ActionRow {...PROPS} requestState={undefined} onCall={onCall} />,
    );
    const form = container.querySelector("form");
    // Enter in a field calls the action, but native validation must not block
    // sending intentionally incomplete input — the endpoint reports it instead.
    expect(form?.noValidate).toBe(true);
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it("announces input the panel refused", async () => {
    // The visual result area is `display: none` until it has content, so a
    // client-side rejection is the one state that produces just a single
    // DOM mutation: without a separately mounted region it would never be
    // announced.
    const container = await renderTestComponent(
      <ActionRow
        {...PROPS}
        requestState={{ kind: "invalid", message: "json is not valid JSON." }}
        onCall={() => {}}
      />,
    );

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "feedback.submit input is invalid. json is not valid JSON.",
    );
  });

  it("keeps announcing a call after the row is collapsed", async () => {
    // The request outlives its editor. If the region lived inside the collapsible
    // block, closing the row mid-request would unmount it and the settled result
    // would land with nowhere to be announced — and re-expanding would only
    // create a region that already holds its text, which is not announced.
    const container = await renderTestComponent(
      <ActionRow {...PROPS} requestState={{ kind: "pending" }} onCall={() => {}} />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toBe("Calling feedback.submit.");

    await rerenderTestComponent(
      <ActionRow
        {...PROPS}
        expanded={false}
        requestState={{
          kind: "completed",
          response: { type: "empty", status: 204, encoding: "json" },
        }}
        onCall={() => {}}
      />,
      container,
    );

    expect(container.querySelector('[data-testid="call-result"]')).toBeNull();
    // The same node throughout, so the result is an update to a region the
    // assistive technology already knows about.
    expect(container.querySelector('[role="status"]')).toBe(status);
    expect(status?.textContent).toBe("feedback.submit returned 204.");
  });

  it("announces a settled call by status without reading the body", async () => {
    const container = await renderTestComponent(
      <ActionRow
        {...PROPS}
        requestState={{
          kind: "completed",
          response: { type: "data", status: 200, data: { ok: true }, encoding: "json" },
        }}
        onCall={() => {}}
      />,
    );

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "feedback.submit returned 200.",
    );
    expect(container.querySelector('[data-testid="call-result"]')?.textContent).toContain("200");
  });
});
