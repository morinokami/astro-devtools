import { parse as devalueParse } from "devalue";

/** Call real Astro Action endpoints and decode their responses. */

/** URL options for the `/_actions/` endpoint from the `astro-devtools:actions:list` RPC. */
interface ActionEndpointOptions {
  /** Resolved `base` of the site; `/` when unset. */
  base?: string;
  /** Whether the call URL should end with a trailing slash. */
  appendTrailingSlash?: boolean;
}

/** One input-validation issue of a rejected call, flattened for display. */
interface ActionIssue {
  /** Dot-path of the input field that the issue is about; empty at the root. */
  path: string;
  message: string;
}

/** Response fields determined from the status and decoded body. */
type ActionResponsePayload =
  /** A 2xx answer whose devalue body decoded to the action's return value. */
  | { type: "data"; status: number; data: unknown }
  /** A 204: the action ran and returned nothing. */
  | { type: "empty"; status: number }
  /** An action error: the code that Astro maps the status to, and its message. */
  | { type: "error"; status: number; code: string; message: string; issues?: ActionIssue[] }
  /**
   * A 2xx whose body is not devalue-encoded, such as a response from a
   * rewrite or proxy instead of the Actions endpoint. It is reported raw
   * rather than guessed at.
   */
  | { type: "raw"; status: number; body: string }
  /** The request failed or the response could not be read; there is no complete response to report. */
  | { type: "unreachable"; message: string };

/** Every normalized response rendered by the Actions panel. */
export type ActionResponse = ActionResponsePayload & {
  /** Encoding used for the request that produced this response. */
  encoding: ActionEncoding;
  /** Explains why the request could not be retried with the required encoding. */
  hint?: string;
};

/** Encoding used for an action request body. */
export type ActionEncoding = "json" | "form";

/**
 * Call an action and retry with the other body encoding when Astro rejects
 * the one used. Astro's server handlers refuse a mismatched encoding before
 * validation or the handler run, so the retry repeats nothing; only that
 * rejection is retried. An action's own `UNSUPPORTED_MEDIA_TYPE` error is
 * its answer and is returned as is — a retry would replace it with Astro's
 * rejection of the other encoding.
 */
export async function callActionWithEncodingFallback(
  actionSegments: readonly string[],
  input: unknown,
  options: ActionEndpointOptions,
  preferred: ActionEncoding = "json",
  fetchFunction: typeof fetch = fetch,
): Promise<ActionResponse> {
  // `undefined` means the input has no form data representation.
  const formInput = input === undefined ? new FormData() : toFormData(input);
  const bodyFor = (encoding: ActionEncoding): unknown => (encoding === "form" ? formInput : input);

  // Use JSON when the preferred form encoding cannot represent this input.
  const encoding: ActionEncoding =
    preferred === "form" && formInput === undefined ? "json" : preferred;
  const firstResponse = await callAction(actionSegments, bodyFor(encoding), options, fetchFunction);
  if (!isEncodingRejection(firstResponse)) return firstResponse;

  const fallbackEncoding = otherEncoding(encoding);
  if (fallbackEncoding === "form" && formInput === undefined) {
    return {
      ...firstResponse,
      hint: 'The input has no form data encoding — a form action takes a flat JSON record of primitive fields (arrays of primitives allowed; dotted keys like "user.name" for nested fields).',
    };
  }
  return callAction(actionSegments, bodyFor(fallbackEncoding), options, fetchFunction);
}

/**
 * The message Astro's server handlers reject a mismatched body encoding
 * with, keyed by the encoding the action accepts instead (astro@7.3.2
 * `actions/runtime/server.js`). The code alone does not identify that
 * rejection: an action's handler can throw `UNSUPPORTED_MEDIA_TYPE` for
 * reasons of its own, such as an upload that takes only PNG images.
 */
const ENCODING_REJECTION_MESSAGES: Record<ActionEncoding, string> = {
  form: "This action only accepts FormData.",
  json: "This action only accepts JSON.",
};

/**
 * Whether Astro refused the request's body encoding before running the
 * action. Its rejection names the encoding the request did not use, so a
 * matching message about the encoding that was sent is the action's own.
 */
export function isEncodingRejection(response: ActionResponse): boolean {
  return (
    response.type === "error" &&
    response.code === "UNSUPPORTED_MEDIA_TYPE" &&
    response.message === ENCODING_REJECTION_MESSAGES[otherEncoding(response.encoding)]
  );
}

function otherEncoding(encoding: ActionEncoding): ActionEncoding {
  return encoding === "json" ? "form" : "json";
}

/** Convert a flat input object into form data, returning `undefined` when unsupported. */
export function toFormData(input: unknown): FormData | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const formData = new FormData();
  for (const [key, value] of Object.entries(input)) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (entry === null || entry === undefined) continue;
      if (typeof entry === "object") return undefined;
      formData.append(key, String(entry));
    }
  }
  return formData;
}

/** POST an action and return a displayable result instead of rejecting. */
export async function callAction(
  actionSegments: readonly string[],
  input: unknown,
  options: ActionEndpointOptions,
  fetchFunction: typeof fetch = fetch,
): Promise<ActionResponse> {
  const headers = new Headers({ Accept: "application/json" });
  const encoding: ActionEncoding = input instanceof FormData ? "form" : "json";
  let body: BodyInit | undefined;
  if (input instanceof FormData) {
    body = input;
  } else if (input === undefined) {
    headers.set("Content-Length", "0");
  } else {
    body = JSON.stringify(input);
    headers.set("Content-Type", "application/json");
  }

  // Only the request and the body read are reported this way; a body that
  // does not decode is a `raw` answer below, and anything else that throws
  // is an unexpected failure for the caller to handle.
  const unreachable = (error: unknown): ActionResponse => ({
    type: "unreachable",
    message: error instanceof Error ? error.message : String(error),
    encoding,
  });

  let response: Response;
  try {
    response = await fetchFunction(actionPath(actionSegments, options), {
      method: "POST",
      body,
      headers,
    });
  } catch (error) {
    return unreachable(error);
  }

  if (response.status === 204) return { type: "empty", status: 204, encoding };
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    return unreachable(error);
  }

  if (response.ok) {
    try {
      // Astro adds URL to devalue's built-in types.
      return {
        type: "data",
        status: response.status,
        data: devalueParse(text, { URL: (href: string) => new URL(href) }),
        encoding,
      };
    } catch {
      return { type: "raw", status: response.status, body: text, encoding };
    }
  }
  return { type: "error", status: response.status, ...parseErrorBody(text), encoding };
}

/** Build the endpoint path used by Astro's action client. */
export function actionPath(
  actionSegments: readonly string[],
  options: ActionEndpointOptions,
): string {
  const base = (options.base ?? "/").replace(/\/$/, "");
  const encodedName = actionSegments
    .map((segment) => encodeURIComponent(segment).replaceAll(".", "%2E"))
    .join(".");
  return `${base}/_actions/${encodedName}${options.appendTrailingSlash === true ? "/" : ""}`;
}

/** Decode Astro action and input errors, preserving validation issues. */
function parseErrorBody(text: string): { code: string; message: string; issues?: ActionIssue[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { code: "INTERNAL_SERVER_ERROR", message: text };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { code: "INTERNAL_SERVER_ERROR", message: text };
  }
  const error = parsed as { type?: unknown; code?: unknown; message?: unknown; issues?: unknown };
  if (error.type === "AstroActionInputError" && Array.isArray(error.issues)) {
    return {
      code: "BAD_REQUEST",
      message: "The input did not validate against the action's schema.",
      issues: error.issues.map(toIssue),
    };
  }
  if (error.type === "AstroActionError") {
    return {
      code: typeof error.code === "string" ? error.code : "INTERNAL_SERVER_ERROR",
      message: typeof error.message === "string" ? error.message : "",
    };
  }
  return { code: "INTERNAL_SERVER_ERROR", message: text };
}

/** Flatten one zod issue (`{ path: ["user", "name"], message }`) for display. */
function toIssue(issue: unknown): ActionIssue {
  const record = (typeof issue === "object" && issue !== null ? issue : {}) as {
    path?: unknown;
    message?: unknown;
  };
  return {
    path: Array.isArray(record.path) ? record.path.map(String).join(".") : "",
    message: typeof record.message === "string" ? record.message : "Invalid input.",
  };
}
