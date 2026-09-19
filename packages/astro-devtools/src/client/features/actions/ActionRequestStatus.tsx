import type { ComponentChildren } from "preact";

import { Badge, Caption } from "@astro-devtools/ui";

import type { ActionRequestState } from "./action-state.ts";
import type { ActionResponse } from "./actions-call.ts";

import { formatActionData } from "./action-response-format.ts";

/** Render the current state of an action request. */
export function ActionRequestStatus({ state }: { state: ActionRequestState }) {
  if (state.kind === "pending") return <Caption>Calling…</Caption>;
  if (state.kind === "invalid" || state.kind === "failed") {
    return (
      <StatusLine>
        <Badge tone="red">{state.kind === "invalid" ? "invalid input" : "call failed"}</Badge>
        <Caption as="span">{state.message}</Caption>
      </StatusLine>
    );
  }
  return <CompletedResponse response={state.response} />;
}

/** Render a completed response and the request encoding used for it. */
function CompletedResponse({ response }: { response: ActionResponse }) {
  const encoding = response.encoding === "form" ? <Badge tone="gray">form data</Badge> : null;
  const hint = response.hint === undefined ? null : <Caption>{response.hint}</Caption>;
  switch (response.type) {
    case "data":
      return (
        <>
          <StatusLine>
            <Badge tone="green">{String(response.status)}</Badge>
            {encoding}
            <Caption as="span">action returned</Caption>
          </StatusLine>
          <ResponseBody>{formatActionData(response.data)}</ResponseBody>
        </>
      );
    case "empty":
      return (
        <StatusLine>
          <Badge tone="green">{String(response.status)}</Badge>
          {encoding}
          <Caption as="span">The action ran and returned nothing.</Caption>
        </StatusLine>
      );
    case "error":
      return (
        <>
          <StatusLine>
            <Badge tone="red">{response.code}</Badge>
            {encoding}
            <Caption as="span">HTTP {response.status}</Caption>
          </StatusLine>
          {response.message === "" ? null : <Caption>{response.message}</Caption>}
          {response.issues === undefined ? null : (
            <ul class="list-disc pl-4.5 text-xs text-muted">
              {/* A completed response never mutates its issue list — a new
                  response replaces it wholesale — so positions are stable
                  identities even for identical issues. */}
              {response.issues.map((issue, index) => (
                <li key={index}>
                  {issue.path === "" ? null : (
                    <>
                      <span class="font-mono">{issue.path}</span>:{" "}
                    </>
                  )}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          {hint}
        </>
      );
    case "raw":
      return (
        <>
          <StatusLine>
            <Badge tone="yellow">{String(response.status)}</Badge>
            {encoding}
            <Caption as="span">
              Response did not use the Astro Action format; showing the raw body:
            </Caption>
          </StatusLine>
          <ResponseBody>{response.body}</ResponseBody>
        </>
      );
    case "unreachable":
      return (
        <StatusLine>
          <Badge tone="red">unreachable</Badge>
          <Caption as="span">{response.message}</Caption>
        </StatusLine>
      );
  }
}

/** Render a response badge and its description. */
function StatusLine({ children }: { children: ComponentChildren }) {
  return <div class="flex items-center gap-2">{children}</div>;
}

/** Render decoded data or an unrecognized response body. */
function ResponseBody({ children }: { children: ComponentChildren }) {
  return (
    <pre class="overflow-x-auto rounded-md border border-subtle p-2 font-mono text-xs text-bright">
      {children}
    </pre>
  );
}
