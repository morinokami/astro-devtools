// @vitest-environment happy-dom

import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ActionDescriptor, ActionsInfo } from "../../../../src/types.ts";

import { NULL_VALUE, OMITTED_VALUE } from "../../../../src/client/features/actions/action-form.ts";
import {
  actionId,
  useActionCallState,
} from "../../../../src/client/features/actions/use-action-call-state.ts";

const FIELDS_DESCRIPTOR: ActionDescriptor = {
  segments: ["greet"],
  qualifiedName: "greet",
  input: {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
      note: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  },
};
const RAW_DESCRIPTOR: ActionDescriptor = {
  segments: ["raw"],
  qualifiedName: "raw",
};
const FIELDS_ACTION_ID = actionId(FIELDS_DESCRIPTOR.segments);
const RAW_ACTION_ID = actionId(RAW_DESCRIPTOR.segments);

let hookState: ReturnType<typeof useActionCallState> | undefined;

function HookView({ actions }: { actions: ActionsInfo["actions"] }) {
  hookState = useActionCallState({ actions });
  return null;
}

async function mountHook(
  actions: ActionsInfo["actions"] = [FIELDS_DESCRIPTOR],
): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  await act(() => render(<HookView actions={actions} />, container));
  return container;
}

afterEach(() => {
  document.body.replaceChildren();
  hookState = undefined;
  vi.unstubAllGlobals();
});

describe("useActionCallState", () => {
  it("keeps literal dots distinct from nested export segments", () => {
    expect(actionId(["feedback.submit"])).not.toBe(actionId(["feedback", "submit"]));
  });

  it("submits generated field values as typed input", async () => {
    const fetchFunction = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal("fetch", fetchFunction);
    await mountHook();
    await act(() =>
      hookState?.updateInputDraft(FIELDS_ACTION_ID, (draft) => ({
        ...draft,
        fields: { name: "Bo", age: "3" },
      })),
    );

    await act(async () => hookState?.callAction(FIELDS_DESCRIPTOR));

    expect(fetchFunction).toHaveBeenCalledTimes(1);
    expect(fetchFunction.mock.calls[0]?.[1]?.body).toBe('{"name":"Bo","age":3}');
    expect(hookState?.rowStates.get(FIELDS_ACTION_ID)?.requestState?.kind).toBe("completed");
  });

  it("submits an explicit empty string and null from generated fields", async () => {
    const fetchFunction = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal("fetch", fetchFunction);
    await mountHook();
    await act(() =>
      hookState?.updateInputDraft(FIELDS_ACTION_ID, (draft) => ({
        ...draft,
        fields: { name: "", age: OMITTED_VALUE, note: NULL_VALUE },
      })),
    );

    await act(async () => hookState?.callAction(FIELDS_DESCRIPTOR));

    expect(fetchFunction.mock.calls[0]?.[1]?.body).toBe('{"name":"","note":null}');
  });

  it("rejects an invalid generated field before making a request", async () => {
    const fetchFunction = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchFunction);
    await mountHook();
    await act(() =>
      hookState?.updateInputDraft(FIELDS_ACTION_ID, (draft) => ({
        ...draft,
        fields: { age: "not-a-number" },
      })),
    );

    await act(async () => hookState?.callAction(FIELDS_DESCRIPTOR));

    expect(fetchFunction).not.toHaveBeenCalled();
    expect(hookState?.rowStates.get(FIELDS_ACTION_ID)?.requestState).toEqual({
      kind: "invalid",
      message: "age is not a finite number.",
    });
  });

  it("uses raw JSON only when no generated fields are available", async () => {
    const fetchFunction = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal("fetch", fetchFunction);
    await mountHook([RAW_DESCRIPTOR]);
    await act(() =>
      hookState?.updateInputDraft(RAW_ACTION_ID, (draft) => ({
        ...draft,
        json: '{ "name": "Bo" }',
      })),
    );

    await act(async () => hookState?.callAction(RAW_DESCRIPTOR));

    expect(fetchFunction.mock.calls[0]?.[1]?.body).toBe('{"name":"Bo"}');
  });

  it("rejects malformed fallback JSON before making a request", async () => {
    const fetchFunction = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchFunction);
    await mountHook([RAW_DESCRIPTOR]);
    await act(() =>
      hookState?.updateInputDraft(RAW_ACTION_ID, (draft) => ({ ...draft, json: "{ bad" })),
    );

    await act(async () => hookState?.callAction(RAW_DESCRIPTOR));

    expect(fetchFunction).not.toHaveBeenCalled();
    const requestState = hookState?.rowStates.get(RAW_ACTION_ID)?.requestState;
    expect(requestState?.kind).toBe("invalid");
    expect(requestState?.kind === "invalid" && requestState.message).toContain(
      "The input is not valid JSON.",
    );
  });

  it("clears a pending call after an unexpected request failure", async () => {
    const response = {} as Response;
    Object.defineProperty(response, "status", {
      get: () => {
        throw new Error("response unavailable");
      },
    });
    const fetchFunction = vi.fn<typeof fetch>(() => Promise.resolve(response));
    vi.stubGlobal("fetch", fetchFunction);
    await mountHook([RAW_DESCRIPTOR]);

    await act(async () => hookState?.callAction(RAW_DESCRIPTOR));
    expect(hookState?.rowStates.get(RAW_ACTION_ID)?.requestState).toEqual({
      kind: "failed",
      message: "response unavailable",
    });

    await act(async () => hookState?.callAction(RAW_DESCRIPTOR));
    expect(fetchFunction).toHaveBeenCalledTimes(2);
  });

  it("learns the accepted encoding from an action's own UNSUPPORTED_MEDIA_TYPE error", async () => {
    // Astro's rejection of the JSON probe is the one 415 that means "wrong
    // encoding". The same code from the handler on the FormData retry is
    // the action answering, so that encoding is the one to remember: the
    // next call starts as FormData instead of probing JSON again.
    const unsupportedMediaType = (message: string): Response =>
      new Response(
        JSON.stringify({
          type: "AstroActionError",
          code: "UNSUPPORTED_MEDIA_TYPE",
          status: 415,
          message,
        }),
        { status: 415 },
      );
    const responses = [
      unsupportedMediaType("This action only accepts FormData."),
      unsupportedMediaType("Only PNG images are accepted."),
      unsupportedMediaType("Only PNG images are accepted."),
    ];
    const fetchFunction = vi.fn<typeof fetch>(() => {
      const response = responses.shift();
      if (response === undefined) throw new Error("more requests than queued responses");
      return Promise.resolve(response);
    });
    vi.stubGlobal("fetch", fetchFunction);
    await mountHook([RAW_DESCRIPTOR]);
    await act(() =>
      hookState?.updateInputDraft(RAW_ACTION_ID, (draft) => ({
        ...draft,
        json: '{ "image": "picture.gif" }',
      })),
    );

    await act(async () => hookState?.callAction(RAW_DESCRIPTOR));
    expect(fetchFunction).toHaveBeenCalledTimes(2);
    expect(hookState?.rowStates.get(RAW_ACTION_ID)?.requestState).toMatchObject({
      kind: "completed",
      response: {
        type: "error",
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Only PNG images are accepted.",
        encoding: "form",
      },
    });

    await act(async () => hookState?.callAction(RAW_DESCRIPTOR));
    expect(fetchFunction).toHaveBeenCalledTimes(3);
    expect(fetchFunction.mock.calls[2]?.[1]?.body).toBeInstanceOf(FormData);
  });

  it("preserves local state while an action file temporarily cannot be imported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
    const container = await mountHook();
    await act(() => hookState?.toggleAction(FIELDS_ACTION_ID));
    await act(() =>
      hookState?.updateInputDraft(FIELDS_ACTION_ID, (draft) => ({
        ...draft,
        fields: { name: "Bo" },
      })),
    );
    await act(async () => hookState?.callAction(FIELDS_DESCRIPTOR));

    await act(() => render(<HookView actions={undefined} />, container));

    expect(hookState?.rowStates.get(FIELDS_ACTION_ID)?.expanded).toBe(true);
    expect(hookState?.rowStates.get(FIELDS_ACTION_ID)?.draft.fields).toEqual({ name: "Bo" });
    expect(hookState?.rowStates.get(FIELDS_ACTION_ID)?.requestState?.kind).toBe("completed");
  });

  it("invalidates an in-flight request when its action is removed", async () => {
    let requestCount = 0;
    // The first request is held open until the assertions below have run.
    const firstRequest = Promise.withResolvers<Response>();
    const fetchFunction = vi.fn<typeof fetch>(() => {
      requestCount += 1;
      if (requestCount === 1) return firstRequest.promise;
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", fetchFunction);
    const container = await mountHook();
    let firstCall: Promise<void> | undefined;
    await act(() => {
      firstCall = hookState?.callAction(FIELDS_DESCRIPTOR);
    });
    expect(hookState?.rowStates.get(FIELDS_ACTION_ID)?.requestState?.kind).toBe("pending");

    await act(() => render(<HookView actions={[]} />, container));
    expect(hookState?.rowStates.get(FIELDS_ACTION_ID)?.requestState).toBeUndefined();

    await act(async () => {
      firstRequest.resolve(new Response(null, { status: 204 }));
      await firstCall;
    });
    expect(hookState?.rowStates.get(FIELDS_ACTION_ID)?.requestState).toBeUndefined();

    await act(() => render(<HookView actions={[FIELDS_DESCRIPTOR]} />, container));
    await act(async () => hookState?.callAction(FIELDS_DESCRIPTOR));
    expect(fetchFunction).toHaveBeenCalledTimes(2);
    expect(hookState?.rowStates.get(FIELDS_ACTION_ID)?.requestState?.kind).toBe("completed");
  });
});
