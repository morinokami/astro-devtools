import { stringify } from "devalue";
import { describe, expect, it } from "vite-plus/test";

import {
  actionPath,
  callAction,
  callActionWithEncodingFallback,
  isEncodingRejection,
  toFormData,
} from "../../../../src/client/features/actions/actions-call.ts";

/** Verify request and response formats used by Astro 7.1.2 Actions. */

/** Serialize a response body the way astro's `serializeActionResult` does. */
const devalueBody = (data: unknown): string =>
  stringify(data, { URL: (value) => value instanceof URL && value.href });

interface CapturedRequest {
  url: string;
  method: string | undefined;
  body: BodyInit | null | undefined;
  headers: Headers;
}

/** Return queued responses and record each request. */
function createFetchStub(...responses: Response[]): {
  fetchFunction: typeof fetch;
  sent: CapturedRequest[];
} {
  const sent: CapturedRequest[] = [];
  const fetchFunction: typeof fetch = (input, init) => {
    sent.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      method: init?.method,
      body: init?.body,
      headers: new Headers(init?.headers),
    });
    const response = responses[Math.min(sent.length, responses.length) - 1] as Response;
    // Hand out a clone: a Response body can be read only once, and the last
    // response, which is handed out repeatedly, would otherwise fail its
    // second read.
    return Promise.resolve(response.clone());
  };
  return { fetchFunction, sent };
}

/**
 * A 415 in Astro's error format. Astro's server handlers answer a mismatched
 * encoding this way, with one of two fixed messages; an action's handler can
 * throw the same code with a message of its own.
 */
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

describe("actionPath", () => {
  it("builds the default endpoint under the site root", () => {
    expect(actionPath(["greet"], {})).toBe("/_actions/greet");
  });

  it("keeps the dots separating group segments", () => {
    expect(actionPath(["feedback", "submit"], {})).toBe("/_actions/feedback.submit");
  });

  it("percent-encodes each segment", () => {
    expect(actionPath(["my greeting", "say hi"], {})).toBe("/_actions/my%20greeting.say%20hi");
  });

  it("distinguishes a dot in an export name from a group separator", () => {
    expect(actionPath(["feedback.submit"], {})).toBe("/_actions/feedback%2Esubmit");
    expect(actionPath(["feedback", "submit"], {})).toBe("/_actions/feedback.submit");
  });

  it("prefixes the base without doubling its trailing slash", () => {
    expect(actionPath(["greet"], { base: "/docs/" })).toBe("/docs/_actions/greet");
    expect(actionPath(["greet"], { base: "/docs" })).toBe("/docs/_actions/greet");
  });

  it("appends the trailing slash when the URL shape takes one", () => {
    expect(actionPath(["greet"], { appendTrailingSlash: true })).toBe("/_actions/greet/");
  });
});

describe("toFormData", () => {
  it("appends one field per primitive entry, stringified", () => {
    const formData = toFormData({ message: "hi", count: 2, ok: true });
    expect(formData?.get("message")).toBe("hi");
    expect(formData?.get("count")).toBe("2");
    expect(formData?.get("ok")).toBe("true");
  });

  it("appends arrays as repeated fields", () => {
    const formData = toFormData({ tags: ["a", "b"] });
    expect(formData?.getAll("tags")).toEqual(["a", "b"]);
  });

  it("skips null and undefined fields", () => {
    const formData = toFormData({ present: "yes", missing: null, gone: undefined });
    expect(formData?.has("missing")).toBe(false);
    expect(formData?.has("gone")).toBe(false);
    expect(formData?.get("present")).toBe("yes");
  });

  it("refuses anything that is not a flat record", () => {
    expect(toFormData("hi")).toBeUndefined();
    expect(toFormData(null)).toBeUndefined();
    expect(toFormData(["a"])).toBeUndefined();
    expect(toFormData({ nested: { deep: true } })).toBeUndefined();
    expect(toFormData({ nested: [{ deep: true }] })).toBeUndefined();
  });
});

describe("callAction", () => {
  it("POSTs JSON input under application/json, like astro's client", async () => {
    const { fetchFunction, sent } = createFetchStub(new Response(devalueBody("Hello, Ada!")));
    const response = await callAction(["greet"], { name: "Ada" }, {}, fetchFunction);
    expect(sent[0]).toMatchObject({ url: "/_actions/greet", method: "POST" });
    expect(sent[0]?.body).toBe('{"name":"Ada"}');
    expect(sent[0]?.headers.get("Content-Type")).toBe("application/json");
    expect(sent[0]?.headers.get("Accept")).toBe("application/json");
    expect(response).toEqual({ type: "data", status: 200, data: "Hello, Ada!", encoding: "json" });
  });

  it("sends no body and Content-Length 0 without input", async () => {
    const { fetchFunction, sent } = createFetchStub(new Response(null, { status: 204 }));
    const response = await callAction(["ping"], undefined, {}, fetchFunction);
    expect(sent[0]?.body).toBeUndefined();
    expect(sent[0]?.headers.get("Content-Length")).toBe("0");
    expect(sent[0]?.headers.get("Content-Type")).toBeNull();
    expect(response).toEqual({ type: "empty", status: 204, encoding: "json" });
  });

  it("passes FormData through as the body", async () => {
    const formData = new FormData();
    formData.append("message", "hi");
    const { fetchFunction, sent } = createFetchStub(new Response(devalueBody({ received: 2 })));
    const response = await callAction(["feedback", "submit"], formData, {}, fetchFunction);
    expect(sent[0]?.body).toBe(formData);
    // The browser derives the multipart content type from the body itself.
    expect(sent[0]?.headers.get("Content-Type")).toBeNull();
    expect(response).toEqual({
      type: "data",
      status: 200,
      data: { received: 2 },
      encoding: "form",
    });
  });

  it("decodes the devalue types astro can return", async () => {
    const data = {
      when: new Date("2026-01-02T03:04:05.000Z"),
      site: new URL("https://astro.build/"),
      tags: new Set(["a"]),
    };
    const { fetchFunction } = createFetchStub(new Response(devalueBody(data)));
    const response = await callAction(["info"], undefined, {}, fetchFunction);
    expect(response).toEqual({ type: "data", status: 200, data, encoding: "json" });
  });

  it("reports a 2xx non-devalue body raw instead of guessing", async () => {
    const { fetchFunction } = createFetchStub(new Response("<!doctype html>"));
    const response = await callAction(["greet"], undefined, {}, fetchFunction);
    expect(response).toEqual({
      type: "raw",
      status: 200,
      body: "<!doctype html>",
      encoding: "json",
    });
  });

  it("decodes an action error's code and message", async () => {
    const body = JSON.stringify({
      type: "AstroActionError",
      code: "UNSUPPORTED_MEDIA_TYPE",
      status: 415,
      message: "This action only accepts FormData.",
    });
    const { fetchFunction } = createFetchStub(new Response(body, { status: 415 }));
    const response = await callAction(["feedback", "submit"], { message: "hi" }, {}, fetchFunction);
    expect(response).toEqual({
      type: "error",
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "This action only accepts FormData.",
      encoding: "json",
    });
  });

  it("flattens an input error's issues for display", async () => {
    const body = JSON.stringify({
      type: "AstroActionInputError",
      issues: [
        { path: ["name"], message: "Required" },
        { path: ["user", "age"], message: "Expected number" },
      ],
      fields: {},
    });
    const { fetchFunction } = createFetchStub(new Response(body, { status: 400 }));
    const response = await callAction(["greet"], {}, {}, fetchFunction);
    expect(response).toMatchObject({
      type: "error",
      status: 400,
      code: "BAD_REQUEST",
      issues: [
        { path: "name", message: "Required" },
        { path: "user.age", message: "Expected number" },
      ],
    });
  });

  it("reports a non-JSON error body as an internal error", async () => {
    const { fetchFunction } = createFetchStub(new Response("Not found", { status: 404 }));
    const response = await callAction(["gone"], undefined, {}, fetchFunction);
    expect(response).toEqual({
      type: "error",
      status: 404,
      code: "INTERNAL_SERVER_ERROR",
      message: "Not found",
      encoding: "json",
    });
  });

  it("reports a failed fetch instead of rejecting", async () => {
    const fetchFunction: typeof fetch = () => Promise.reject(new Error("connection refused"));
    const response = await callAction(["greet"], undefined, {}, fetchFunction);
    expect(response).toEqual({
      type: "unreachable",
      message: "connection refused",
      encoding: "json",
    });
  });

  it("reports a failed response body read instead of rejecting", async () => {
    const response = {
      status: 200,
      ok: true,
      text: () => Promise.reject(new Error("response stream interrupted")),
    } as Response;
    const fetchFunction: typeof fetch = () => Promise.resolve(response);

    const result = await callAction(["greet"], undefined, {}, fetchFunction);

    expect(result).toEqual({
      type: "unreachable",
      message: "response stream interrupted",
      encoding: "json",
    });
  });
});

describe("callActionWithEncodingFallback", () => {
  it("answers in one round trip when JSON is accepted", async () => {
    const { fetchFunction, sent } = createFetchStub(new Response(devalueBody("Hello!")));
    const response = await callActionWithEncodingFallback(
      ["greet"],
      { name: "Ada" },
      {},
      undefined,
      fetchFunction,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toBe('{"name":"Ada"}');
    expect(response).toEqual({
      type: "data",
      status: 200,
      data: "Hello!",
      encoding: "json",
    });
  });

  it("retries as FormData when the endpoint only accepts it", async () => {
    const { fetchFunction, sent } = createFetchStub(
      unsupportedMediaType("This action only accepts FormData."),
      new Response(devalueBody({ received: 2 })),
    );
    const response = await callActionWithEncodingFallback(
      ["feedback", "submit"],
      { message: "hi" },
      {},
      undefined,
      fetchFunction,
    );
    expect(sent).toHaveLength(2);
    expect(sent[0]?.body).toBe('{"message":"hi"}');
    const retryBody = sent[1]?.body;
    expect(retryBody).toBeInstanceOf(FormData);
    expect((retryBody as FormData).get("message")).toBe("hi");
    expect(response).toEqual({
      type: "data",
      status: 200,
      data: { received: 2 },
      encoding: "form",
    });
  });

  it("uses form immediately when the accepted encoding is already known", async () => {
    const { fetchFunction, sent } = createFetchStub(new Response(devalueBody({ received: 2 })));
    const response = await callActionWithEncodingFallback(
      ["feedback", "submit"],
      { message: "hi" },
      {},
      "form",
      fetchFunction,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toBeInstanceOf(FormData);
    expect(response.encoding).toBe("form");
  });

  it("re-negotiates a stale form preference back to JSON", async () => {
    const { fetchFunction, sent } = createFetchStub(
      unsupportedMediaType("This action only accepts JSON."),
      new Response(devalueBody("Hello!")),
    );
    const response = await callActionWithEncodingFallback(
      ["greet"],
      { name: "Ada" },
      {},
      "form",
      fetchFunction,
    );
    expect(sent).toHaveLength(2);
    expect(sent[1]?.body).toBe('{"name":"Ada"}');
    expect(response).toEqual({ type: "data", status: 200, data: "Hello!", encoding: "json" });
  });

  it("falls back to JSON up front when a form preference cannot encode the input", async () => {
    const { fetchFunction, sent } = createFetchStub(new Response(devalueBody("ok")));
    const response = await callActionWithEncodingFallback(
      ["greet"],
      { nested: { deep: true } },
      {},
      "form",
      fetchFunction,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toBe('{"nested":{"deep":true}}');
    expect(response.encoding).toBe("json");
  });

  it("keeps the endpoint's rejection with a hint when the input has no form encoding", async () => {
    const { fetchFunction, sent } = createFetchStub(
      unsupportedMediaType("This action only accepts FormData."),
    );
    const response = await callActionWithEncodingFallback(
      ["upload"],
      { nested: { deep: true } },
      {},
      undefined,
      fetchFunction,
    );
    expect(sent).toHaveLength(1);
    expect(response.encoding).toBe("json");
    expect(response).toMatchObject({ type: "error", code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(response.hint).toContain("form data encoding");
  });

  it("retries a no-input call as an empty form", async () => {
    const { fetchFunction, sent } = createFetchStub(
      unsupportedMediaType("This action only accepts FormData."),
      new Response(null, { status: 204 }),
    );
    const response = await callActionWithEncodingFallback(
      ["ping"],
      undefined,
      {},
      undefined,
      fetchFunction,
    );
    expect(sent).toHaveLength(2);
    expect(sent[0]?.body).toBeUndefined();
    const retryBody = sent[1]?.body;
    expect(retryBody).toBeInstanceOf(FormData);
    expect([...(retryBody as FormData).keys()]).toEqual([]);
    expect(response).toEqual({ type: "empty", status: 204, encoding: "form" });
  });

  it("gives up after one retry when both encodings are rejected", async () => {
    const { fetchFunction, sent } = createFetchStub(
      unsupportedMediaType("This action only accepts FormData."),
      unsupportedMediaType("This action only accepts JSON."),
    );
    const response = await callActionWithEncodingFallback(
      ["odd"],
      { a: 1 },
      {},
      undefined,
      fetchFunction,
    );
    expect(sent).toHaveLength(2);
    expect(response.encoding).toBe("form");
    expect(response).toMatchObject({ type: "error", code: "UNSUPPORTED_MEDIA_TYPE" });
  });

  it("keeps an action's own UNSUPPORTED_MEDIA_TYPE error instead of retrying", async () => {
    // The handler ran and answered under the code Astro also uses for a
    // mismatched encoding. Retrying as FormData would make this JSON action
    // answer "This action only accepts JSON." — Astro's message shown in
    // place of the action's.
    const { fetchFunction, sent } = createFetchStub(
      unsupportedMediaType("Only PNG images are accepted."),
      unsupportedMediaType("This action only accepts JSON."),
    );
    const response = await callActionWithEncodingFallback(
      ["upload"],
      { image: "picture.gif" },
      {},
      undefined,
      fetchFunction,
    );
    expect(sent).toHaveLength(1);
    expect(response).toEqual({
      type: "error",
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Only PNG images are accepted.",
      encoding: "json",
    });
  });

  it.each([
    { encoding: "json" as const, message: "This action only accepts JSON." },
    { encoding: "form" as const, message: "This action only accepts FormData." },
  ])(
    "keeps a rejection that names the $encoding encoding already sent",
    async ({ encoding, message }) => {
      // Astro's handlers never refuse the encoding they accept, so this
      // message can only be the action's own.
      const { fetchFunction, sent } = createFetchStub(unsupportedMediaType(message));
      const response = await callActionWithEncodingFallback(
        ["greet"],
        { name: "Ada" },
        {},
        encoding,
        fetchFunction,
      );
      expect(sent).toHaveLength(1);
      expect(response).toMatchObject({
        type: "error",
        code: "UNSUPPORTED_MEDIA_TYPE",
        message,
        encoding,
      });
    },
  );
});

describe("isEncodingRejection", () => {
  it("ignores other codes and response types", () => {
    // Every message-matching branch is covered through
    // `callActionWithEncodingFallback`; only these guards are not reachable
    // from a real endpoint answer.
    expect(
      isEncodingRejection({
        type: "error",
        status: 400,
        code: "BAD_REQUEST",
        message: "This action only accepts FormData.",
        encoding: "json",
      }),
    ).toBe(false);
    expect(
      isEncodingRejection({
        type: "unreachable",
        message: "This action only accepts FormData.",
        encoding: "json",
      }),
    ).toBe(false);
  });
});
