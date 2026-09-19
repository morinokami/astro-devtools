/**
 * One real action round-trip per encoding, through the panel's own form
 * against the live /_actions/ endpoint, plus the documented limitation (a
 * `File` input) as a user meets it. The encoding negotiation and result
 * formatting are unit-tested against a mocked fetch; what only this suite
 * can show is that astro's actual wire format still matches those mocks —
 * down to the wording of the 415 by which the panel tells astro's own
 * encoding rejection from an action's error under the same code.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { switchPanel, waitFor } from "./support/helpers.ts";

let base: string;
let page: Page;

// Rows are reached through DOM that the panel offers anyway: the header toggle
// carries the action's qualified name as its `title`, and while expanded its
// `aria-controls` points at the generated id of the request editor, so the
// form is found by following that reference.
function callAction(target: Page, key: string, values: Record<string, string | null>) {
  return target.evaluate(
    async ({ key, values }) => {
      // Preact commits state updates on a microtask, so anything that must
      // observe a re-render (the conditionally rendered form appearing, the
      // Call handler closing over the updated draft) waits one macrotask.
      const nextTask = () => new Promise((resolve) => setTimeout(resolve));
      const toggle = globalThis.__deepFind(document, `button[aria-expanded][title="${key}"]`)[0];
      if (!(toggle instanceof HTMLElement)) throw new Error(`no action toggle for ${key}`);
      // Expand only when collapsed — a second call on the same row must not
      // toggle the form shut again.
      if (toggle.getAttribute("aria-expanded") !== "true") {
        toggle.click();
        await nextTask();
      }
      const formId = toggle.getAttribute("aria-controls");
      const form = formId && globalThis.__deepFind(document, `[id="${formId}"]`)[0];
      if (!form) throw new Error(`no call form for ${key}`);
      // Every value must land in a control: a field the generator silently
      // dropped would otherwise be omitted from the call, and the tests
      // below assert on what the endpoint received.
      const unset = new Set(Object.keys(values));
      for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "input[name], select[name]",
      )) {
        const { name } = control;
        if (!unset.delete(name)) continue;
        const value = values[name];
        // null is a labelled choice rather than text: an option of a select
        // control itself, or of the value select beside a text or number
        // input. Text is written into the control.
        let target: HTMLInputElement | HTMLSelectElement = control;
        if (value === null) {
          const select =
            control instanceof HTMLSelectElement
              ? control
              : form.querySelector<HTMLSelectElement>(`select[aria-label="${name} value"]`);
          const nullOption = [...(select?.options ?? [])].find(
            (option) => option.textContent === "null",
          );
          if (!select || !nullOption) {
            throw new Error(`no null choice for ${name} in the ${key} form`);
          }
          select.value = nullOption.value;
          target = select;
        } else {
          control.value = value;
        }
        // The controls are controlled Preact inputs: writing `.value` never
        // reaches the component's draft state on its own, so each write
        // dispatches the event the control listens for — "change" for
        // selects, "input" for the rest — on the element itself.
        target.dispatchEvent(
          new Event(target.localName === "select" ? "change" : "input", { bubbles: true }),
        );
      }
      if (unset.size > 0) {
        throw new Error(`no control for ${[...unset].join(", ")} in the ${key} form`);
      }
      // The dispatched events queued draft updates; the click below must run
      // against handlers rendered from that updated draft.
      await nextTask();
      const call = [...form.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Call action"),
      );
      if (!call) throw new Error(`no Call action button for ${key}`);
      // Reset the resource-timing buffer right before the click so request
      // counts cover exactly this call — the page-lifetime buffer caps at
      // ~250 entries and a vite dev page can fill it with module requests.
      performance.clearResourceTimings();
      call.click();
    },
    { key, values },
  );
}

function resultText(target: Page, key: string) {
  return target.evaluate((key) => {
    const toggle = globalThis.__deepFind(document, `button[aria-expanded][title="${key}"]`)[0];
    const formId = toggle?.getAttribute("aria-controls");
    const form = formId ? globalThis.__deepFind(document, `[id="${formId}"]`)[0] : undefined;
    // The visual result area, not the row's screen-reader status region: only
    // the former carries the decoded response body that these tests assert on.
    return (
      form
        ?.querySelector('[data-testid="call-result"]')
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? ""
    );
  }, key);
}

// The decoded response body as the result area prints it. formatActionData
// renders JSON-compatible data as JSON, so the text parses back into the
// value and a test can compare the whole echoed input at once.
async function resultData(target: Page, key: string): Promise<unknown> {
  const text = await target.evaluate((key) => {
    const toggle = globalThis.__deepFind(document, `button[aria-expanded][title="${key}"]`)[0];
    const formId = toggle?.getAttribute("aria-controls");
    const form = formId ? globalThis.__deepFind(document, `[id="${formId}"]`)[0] : undefined;
    return form?.querySelector('[data-testid="call-result"] pre')?.textContent ?? "";
  }, key);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`the ${key} result shows no JSON body: ${JSON.stringify(text)}`);
  }
}

// The result area shows "Calling…" while the request is in
// flight; a settled result is any other non-empty text. Pass the region's
// text from before the click when re-calling a row that already settled
// once, so the stale result is not mistaken for the new one.
async function settledResult(target: Page, key: string, previous = "") {
  await waitFor(
    async () => {
      const text = await resultText(target, key);
      return text.length > 0 && !text.includes("Calling") && text !== previous;
    },
    { label: `${key} call result settled` },
  );
  return resultText(target, key);
}

test.beforeEach(async ({ page: testPage, baseUrl }) => {
  base = baseUrl;
  page = testPage;
  await page.goto(`${base}/`);
  // Rows render once the actions RPC answers; the playground's own `greet`
  // toggle doubles as the mount signal.
  await switchPanel(page, "astro-devtools:actions", 'button[aria-expanded][title="greet"]');
});

test("the Actions panel calls a JSON action through its generated form", async () => {
  await callAction(page, "greet", { name: "Ada" });
  const result = await settledResult(page, "greet");
  expect(result).toContain("200");
  // This assertion stays at the content level: the exact JSON rendering is
  // covered by formatActionData's unit tests.
  expect(result).toMatch(/Hello, Ada!/);
});

test("the Actions panel surfaces astro's real error wire format on a schema-rejected call", async () => {
  // Emptying the required field sends {}, which the action's input schema
  // rejects — proving the live AstroActionInputError body still matches the
  // hand-built mocks that the unit suite runs against. The detail of issue
  // flattening is covered by the unit tests.
  const previous = await resultText(page, "greet");
  await callAction(page, "greet", { name: "" });
  const result = await settledResult(page, "greet", previous);
  expect(result).toContain("BAD_REQUEST");
});

test("the Actions panel calls a form action over FormData in a single request", async () => {
  await callAction(page, "feedback.submit", { message: "hi" });
  const result = await settledResult(page, "feedback.submit");
  expect(result).toContain("200");
  expect(result).toMatch(/received\D{0,4}2/);

  // No encoding choice is offered anywhere in the row; one Call click must
  // land on FormData by itself — and in ONE request, because the metadata's
  // `accept` seeds the encoding rather than a probe request discovering
  // it. callAction cleared the
  // resource-timing buffer right before the click, so the count covers
  // exactly this call even across retries.
  const requests = await page.evaluate(
    () =>
      performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.includes("/_actions/feedback.submit")).length,
  );
  expect(requests).toBe(1);
});

test("the live endpoint still words its encoding rejections the way the panel's retry recognizes them", async () => {
  // The panel retries with the other encoding only on astro's own
  // UNSUPPORTED_MEDIA_TYPE rejection, told apart from an action's error under
  // the same code by one of two fixed messages, which the unit suite mocks.
  // The `accept` metadata keeps every panel call here on the right encoding,
  // so the mismatch is provoked directly: JSON at the form action and form
  // data at the JSON action, at the URLs the panel itself would POST to. The
  // requests leave from the page, as the panel's do — astro's CSRF check
  // refuses a POST without the page's Origin before any action code runs.
  const rejection = (path: string, input: Record<string, string>, encoding: "json" | "form") =>
    page.evaluate(
      async ({ path, input, encoding }) => {
        const headers: Record<string, string> = { Accept: "application/json" };
        let body: BodyInit;
        if (encoding === "form") {
          const formData = new FormData();
          for (const [key, value] of Object.entries(input)) formData.append(key, value);
          body = formData;
        } else {
          body = JSON.stringify(input);
          headers["Content-Type"] = "application/json";
        }
        const response = await fetch(path, { method: "POST", body, headers });
        return { status: response.status, body: (await response.json()) as unknown };
      },
      { path, input, encoding },
    );
  expect(await rejection("/_actions/feedback.submit/", { message: "hi" }, "json")).toEqual({
    status: 415,
    body: expect.objectContaining({
      type: "AstroActionError",
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "This action only accepts FormData.",
    }),
  });
  expect(await rejection("/_actions/greet/", { name: "Ada" }, "form")).toEqual({
    status: 415,
    body: expect.objectContaining({
      type: "AstroActionError",
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "This action only accepts JSON.",
    }),
  });
});

test("the Actions panel calls the survey action through its typed generated controls", async () => {
  // survey holds one field of every control kind that the generator knows
  // (text, number, boolean select, enum select, array). The control kinds
  // and value coercion are unit-tested against copied z.toJSONSchema
  // output; the handler echoes its input, so the live endpoint's answer
  // shows whether that fixture has drifted. A 200 alone would not: the
  // schema accepts the call with every optional field dropped and the
  // boolean left to its default, so each value is checked as received.
  await callAction(page, "survey", {
    name: "Ada",
    age: "36",
    subscribed: "true",
    color: "red",
    tags: '["a", "b"]',
  });
  const result = await settledResult(page, "survey");
  expect(result).toContain("200");
  expect(await resultData(page, "survey")).toEqual({
    name: "Ada",
    age: 36,
    subscribed: true,
    color: "red",
    tags: ["a", "b"],
  });
});

test("the Actions panel sends an explicit empty string and null through its generated controls", async () => {
  // A blank control omits its field, so these two values are choices of
  // their own: "" as the enum select's own member (beside the omit entry
  // that looks just as blank), and null from the value select beside a
  // nullable text input. The schema accepts the call with both fields
  // dropped as well, so only the echoed input shows they arrived as
  // themselves.
  await callAction(page, "survey", { name: "Ada", layout: "", note: null });
  const result = await settledResult(page, "survey");
  expect(result).toContain("200");
  expect(await resultData(page, "survey")).toEqual({
    name: "Ada",
    subscribed: false,
    note: null,
    layout: "",
  });
});

test("the Actions panel gets the File upload action rejected by the live endpoint, as documented", async () => {
  // upload takes a File, which has no JSON Schema form: the metadata
  // wrapper emits an empty schema for the field (the shape rpc.test.ts
  // pins), so the panel can only offer a JSON text control for it. This is
  // the documented "cannot be called from the panel" limitation as a user
  // meets it: the closest thing that control can send, the file's name,
  // goes out as form data and astro's real schema check turns it down with
  // an issue pinned to the field — not an encoding error, and not a 200 that
  // would mean a string passed for a File.
  await callAction(page, "upload", { file: '"notes.txt"' });
  const result = await settledResult(page, "upload");
  expect(result).toContain("BAD_REQUEST");
  expect(result).toContain("form data");
  expect(result).toMatch(/\bfile: .*\bFile\b/);
});

// Only a real browser can show this: a native `disabled` on the pending button
// blurs the control the user just activated, and because the panel lives in a
// shadow root focus falls through to the host page and is never returned.
// happy-dom does not implement the focus-fixup rule, so no unit test can
// cover it.
test("the call button keeps focus across a call", async () => {
  await page.evaluate(async () => {
    const nextTask = () => new Promise((resolve) => setTimeout(resolve));
    const toggle = globalThis.__deepFind(document, 'button[aria-expanded][title="greet"]')[0];
    if (!(toggle instanceof HTMLElement)) throw new Error("no action toggle for greet");
    if (toggle.getAttribute("aria-expanded") !== "true") {
      toggle.click();
      await nextTask();
    }
    const formId = toggle.getAttribute("aria-controls");
    const form = formId && globalThis.__deepFind(document, `[id="${formId}"]`)[0];
    if (!form) throw new Error("no call form for greet");
    const call = [...form.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Call action"),
    );
    if (!call) throw new Error("no Call action button for greet");
    call.focus();
    call.click();
  });

  await waitFor(
    () =>
      page.evaluate(() => {
        const toggle = globalThis.__deepFind(document, 'button[aria-expanded][title="greet"]')[0];
        const formId = toggle?.getAttribute("aria-controls");
        const form = formId ? globalThis.__deepFind(document, `[id="${formId}"]`)[0] : undefined;
        const call = [...(form?.querySelectorAll("button") ?? [])].find((button) =>
          button.textContent?.includes("Call action"),
        );
        if (!call) return false;
        const root = call.getRootNode() as ShadowRoot | Document;
        // Settled, and still the focused element of its own root.
        return !call.hasAttribute("aria-disabled") && root.activeElement === call;
      }),
    { label: "greet call button still focused once the call settled" },
  );
});
