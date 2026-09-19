import {
  Button,
  Caption,
  DisclosureButton,
  Row,
  StatusAnnouncer,
  TextArea,
} from "@astro-devtools/ui";
import { useId } from "preact/hooks";

import type { ActionField } from "./action-form.ts";
import type { ActionInputDraft, ActionRequestState } from "./action-state.ts";

import { OMITTED_VALUE } from "./action-form.ts";
import { ActionRequestStatus } from "./ActionRequestStatus.tsx";
import { FieldRow } from "./FieldRow.tsx";

interface ActionRowProps {
  /** Human-readable dot-separated action name, such as `feedback.submit`. */
  qualifiedName: string;
  /** Generated input fields; `undefined` leaves only the JSON textarea. */
  fields: ActionField[] | undefined;
  /** `/_actions/` URL displayed beside the call button. */
  endpoint: string;
  expanded: boolean;
  draft: ActionInputDraft;
  /** The latest request state; absent before the first request. */
  requestState: ActionRequestState | undefined;
  onToggle: () => void;
  onFieldInput: (name: string, value: string) => void;
  onJsonInput: (value: string) => void;
  onCall: () => void;
}

/** Render one expandable action request editor and its latest state. */
export function ActionRow({
  qualifiedName,
  fields,
  endpoint,
  expanded,
  draft,
  requestState,
  onToggle,
  onFieldInput,
  onJsonInput,
  onCall,
}: ActionRowProps) {
  const panelId = useId();
  const pending = requestState?.kind === "pending";
  return (
    <Row>
      {/*
       * This live region sits outside the collapsible request editor on
       * purpose. A live region has to exist before its content changes in
       * order to be announced, and the request outlives the editor:
       * collapsing the row mid-request would otherwise unmount the region
       * and lose the result, which re-expanding cannot announce.
       */}
      <StatusAnnouncer>{requestStatusAnnouncement(qualifiedName, requestState)}</StatusAnnouncer>
      <DisclosureButton
        expanded={expanded}
        controls={panelId}
        class="rounded-sm px-2 py-1.75 text-bright hover:bg-accent/12"
        title={qualifiedName}
        onClick={onToggle}
      >
        <span class="min-w-0 truncate font-mono">{qualifiedName}</span>
      </DisclosureButton>
      {expanded && (
        <form
          id={panelId}
          class="flex flex-col gap-2 pt-0.5 pr-2 pb-3 pl-6.5"
          // Native validation would block sending intentionally incomplete
          // input, which this panel exists to allow; validation errors are the
          // endpoint's to report. The form element exists so pressing Enter
          // submits the call.
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) onCall();
          }}
        >
          {fields !== undefined ? (
            <div class="flex flex-col gap-1.5">
              {fields.map((field) => (
                <FieldRow
                  key={field.name}
                  field={field}
                  value={draft.fields[field.name] ?? OMITTED_VALUE}
                  onInput={(value) => onFieldInput(field.name, value)}
                />
              ))}
            </div>
          ) : (
            <TextArea
              class="min-h-14 font-mono"
              rows={3}
              spellcheck={false}
              aria-label={`Input for ${qualifiedName}`}
              placeholder='{ "name": "Ada" } — leave empty to send no input'
              value={draft.json}
              onInput={(event) => onJsonInput(event.currentTarget.value)}
            />
          )}
          <div class="flex min-w-0 flex-wrap items-center gap-2.5">
            <Button type="submit" inactive={pending}>
              Call action
            </Button>
            <Caption as="span" class="min-w-0 truncate font-mono" title={`POST ${endpoint}`}>
              POST {endpoint}
            </Caption>
          </div>
          {/* Announced by the status region above; this is the visual copy. */}
          <div data-testid="call-result" class="flex flex-col gap-1.5 empty:hidden">
            {requestState === undefined ? null : <ActionRequestStatus state={requestState} />}
          </div>
        </form>
      )}
    </Row>
  );
}

/** Summarize a request without reading the whole response body aloud. */
function requestStatusAnnouncement(
  qualifiedName: string,
  requestState: ActionRequestState | undefined,
): string {
  if (requestState === undefined) return "";
  switch (requestState.kind) {
    case "pending":
      return `Calling ${qualifiedName}.`;
    case "invalid":
      return `${qualifiedName} input is invalid. ${requestState.message}`;
    case "failed":
      return `${qualifiedName} failed. ${requestState.message}`;
    case "completed": {
      const { response } = requestState;
      if (response.type === "unreachable") {
        return `${qualifiedName} was unreachable. ${response.message}`;
      }
      if (response.type === "error") {
        return `${qualifiedName} returned ${response.status} ${response.code}.`;
      }
      return `${qualifiedName} returned ${response.status}.`;
    }
  }
}
