// @vitest-environment happy-dom

import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ActionField } from "../../../../src/client/features/actions/action-form.ts";

import { NULL_VALUE, OMITTED_VALUE } from "../../../../src/client/features/actions/action-form.ts";
import { FieldRow } from "../../../../src/client/features/actions/FieldRow.tsx";

afterEach(() => {
  document.body.replaceChildren();
});

describe("FieldRow", () => {
  it("exposes the schema's required state and description", () => {
    const container = mount({
      name: "email",
      kind: "text",
      required: true,
      description: "Where to send the reply",
    });
    const input = container.querySelector("input");
    const descriptionId = input?.getAttribute("aria-describedby");

    expect(input?.required).toBe(true);
    expect(input?.name).toBe("email");
    expect(input?.hasAttribute("aria-label")).toBe(false);
    expect(container.querySelector("label")?.htmlFor).toBe(input?.id);
    expect(container.querySelector("label")?.textContent).toContain("email");
    expect(descriptionId).toBeTruthy();
    expect(container.querySelector(`#${descriptionId}`)?.textContent).toBe(
      "Where to send the reply",
    );
  });

  it("leaves optional fields unrequired and without a description reference", () => {
    const container = mount({ name: "nickname", kind: "text", required: false });
    const input = container.querySelector("input");

    expect(input?.required).toBe(false);
    expect(input?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("shows a schema default in the placeholder", () => {
    // The placeholder is the only surface for a default. That it stays
    // readable is `TextInput`'s contract, which its story checks in a browser.
    const container = mount({ name: "count", kind: "number", required: false, defaultText: "10" });
    const input = container.querySelector("input");

    expect(input?.placeholder).toBe("default: 10");
  });

  it("applies the required state to select controls", () => {
    const boolean = mount({ name: "enabled", kind: "boolean", required: true });
    const choice = mount({
      name: "color",
      kind: "select",
      required: true,
      options: ["purple"],
    });

    expect(boolean.querySelector("select")?.required).toBe(true);
    expect(choice.querySelector("select")?.required).toBe(true);
  });

  it("offers omission apart from an enum's own empty string", () => {
    // Both would be blank options: "" is a member the select must be able to
    // send, so omission takes a sentinel value and "" a readable label.
    const container = mount({
      name: "layout",
      kind: "select",
      required: false,
      options: ["", "wide"],
    });
    const options = [...(container.querySelector("select")?.options ?? [])];

    expect(options.map((option) => option.value)).toEqual([OMITTED_VALUE, "", "wide"]);
    expect(options.map((option) => option.textContent)).toEqual(["—", "empty string", "wide"]);
  });

  it("offers null only when the schema allows it", () => {
    const nullable = mount({ name: "enabled", kind: "boolean", required: true, nullable: true });
    const plain = mount({ name: "color", kind: "select", required: false, options: ["purple"] });

    expect(optionValues(nullable.querySelector("select"))).toEqual([
      OMITTED_VALUE,
      "true",
      "false",
      NULL_VALUE,
    ]);
    expect(optionValues(plain.querySelector("select"))).toEqual([OMITTED_VALUE, "purple"]);
  });

  it("omits a text field once it is cleared", () => {
    const onInput = vi.fn();
    const container = mount(
      { name: "name", kind: "text", required: true },
      { value: "Ada", onInput },
    );
    const input = container.querySelector("input");
    expect(input?.value).toBe("Ada");

    type(input, "");
    expect(onInput).toHaveBeenLastCalledWith(OMITTED_VALUE);
    type(input, "Bo");
    expect(onInput).toHaveBeenLastCalledWith("Bo");
  });

  it("lets a text input send the empty string or null from the select beside it", () => {
    const onInput = vi.fn();
    const container = mount(
      { name: "note", kind: "text", required: false, nullable: true },
      { onInput },
    );
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="note value"]');
    expect([...(select?.options ?? [])].map((option) => option.textContent)).toEqual([
      "text",
      "empty string",
      "null",
    ]);

    choose(select, "");
    expect(onInput).toHaveBeenLastCalledWith("");
    choose(select, NULL_VALUE);
    expect(onInput).toHaveBeenLastCalledWith(NULL_VALUE);
    choose(select, OMITTED_VALUE);
    expect(onInput).toHaveBeenLastCalledWith(OMITTED_VALUE);
  });

  it("shows a chosen null in the blank input's placeholder instead of the default", () => {
    const container = mount(
      { name: "note", kind: "text", required: false, nullable: true, defaultText: '"hi"' },
      { value: NULL_VALUE },
    );
    const input = container.querySelector("input");

    expect(input?.value).toBe("");
    expect(input?.placeholder).toBe("null");
    expect(
      container.querySelector<HTMLSelectElement>('select[aria-label="note value"]')?.value,
    ).toBe(NULL_VALUE);
  });

  it("adds the value select to a number input only for null, and never to JSON", () => {
    const valueSelect = (container: HTMLElement) =>
      container.querySelector<HTMLSelectElement>('select[aria-label$=" value"]');

    expect(valueSelect(mount({ name: "age", kind: "number", required: false }))).toBeNull();
    expect(
      valueSelect(mount({ name: "tags", kind: "json", required: false, nullable: true })),
    ).toBeNull();
    const nullableNumber = mount({ name: "age", kind: "number", required: false, nullable: true });
    expect(
      [...(valueSelect(nullableNumber)?.options ?? [])].map((option) => option.textContent),
    ).toEqual(["number", "null"]);
  });
});

function mount(
  field: ActionField,
  {
    value = OMITTED_VALUE,
    onInput = () => {},
  }: { value?: string; onInput?: (value: string) => void } = {},
): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  render(<FieldRow field={field} value={value} onInput={onInput} />, container);
  return container;
}

function optionValues(select: HTMLSelectElement | null): string[] {
  return [...(select?.options ?? [])].map((option) => option.value);
}

/** Write into a controlled input the way typing does: set the value, then fire the event it listens for. */
function type(input: HTMLInputElement | null, value: string): void {
  if (!input) throw new Error("no input");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function choose(select: HTMLSelectElement | null, value: string): void {
  if (!select) throw new Error("no select");
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
