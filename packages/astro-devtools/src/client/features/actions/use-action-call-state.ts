import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import type { ActionDescriptor, ActionsInfo } from "../../../types.ts";
import type { ActionField } from "./action-form.ts";
import type { ActionInputDraft, ActionRequestState, ActionRowState } from "./action-state.ts";
import type { ActionEncoding } from "./actions-call.ts";

import { fieldsFromSchema, readFieldValues } from "./action-form.ts";
import { EMPTY_ROW_STATE } from "./action-state.ts";
import { callActionWithEncodingFallback, isEncodingRejection } from "./actions-call.ts";

type DraftInputResult = { ok: true; value: unknown } | { ok: false; message: string };

/** Manage the expanded rows, drafts, and requests in the Actions panel. */
export function useActionCallState(actionsInfo: ActionsInfo | undefined) {
  const [rowStates, setRowStates] = useState<ReadonlyMap<string, ActionRowState>>(() => new Map());
  const acceptedEncodingsByActionId = useRef(new Map<string, ActionEncoding>());
  /**
   * The token of the only request still allowed to settle for each action.
   * An action id is in this map exactly while its request is in flight, so
   * the map also answers "is this action pending?".
   */
  const requestTokensByActionId = useRef(new Map<string, symbol>());

  const fieldsByActionId = useMemo(() => {
    const fieldsByActionId = new Map<string, ActionField[]>();
    for (const descriptor of actionsInfo?.actions ?? []) {
      const fields = fieldsFromSchema(descriptor.input);
      if (fields) fieldsByActionId.set(actionId(descriptor.segments), fields);
    }
    return fieldsByActionId;
  }, [actionsInfo]);

  // Remove local state and invalidate requests only after a refresh returned a
  // concrete action list. `actions: undefined` means the file temporarily
  // failed to import, so treating it as an empty list would erase drafts during
  // the exact edit-and-reload workflow this panel serves.
  useEffect(() => {
    if (actionsInfo?.actions === undefined) return;
    const currentActionIds = new Set(
      actionsInfo.actions.map((action) => actionId(action.segments)),
    );
    // Returning the unchanged map is required, not an optimization: the
    // effect re-runs whenever `actionsInfo` is a fresh reference, and a new
    // map on every pass would re-render (and so re-run) forever.
    setRowStates((previous) => {
      const next = new Map(previous.entries().filter(([id]) => currentActionIds.has(id)));
      return next.size === previous.size ? previous : next;
    });

    // Dropping a removed action's token invalidates its in-flight request:
    // the settle handlers see a token mismatch and ignore the response. The
    // learned encodings survive on purpose — they are a cache, and an
    // action that briefly leaves one refreshed list mid-edit usually comes
    // right back; dropping its entry would replay the 415 encoding
    // fallback on the next call.
    for (const id of requestTokensByActionId.current.keys()) {
      if (!currentActionIds.has(id)) requestTokensByActionId.current.delete(id);
    }
  }, [actionsInfo]);

  const updateRow = (id: string, update: (row: ActionRowState) => ActionRowState): void => {
    setRowStates((previous) =>
      new Map(previous).set(id, update(previous.get(id) ?? EMPTY_ROW_STATE)),
    );
  };

  const toggleAction = (id: string): void => {
    updateRow(id, (row) => ({ ...row, expanded: !row.expanded }));
  };

  const updateInputDraft = (
    id: string,
    update: (draft: ActionInputDraft) => ActionInputDraft,
  ): void => {
    updateRow(id, (row) => ({ ...row, draft: update(row.draft) }));
  };

  const setRequestState = (id: string, requestState: ActionRequestState): void => {
    updateRow(id, (row) => ({ ...row, requestState }));
  };

  const callAction = async (descriptor: ActionDescriptor): Promise<void> => {
    const id = actionId(descriptor.segments);
    if (requestTokensByActionId.current.has(id)) return;
    const fields = fieldsByActionId.get(id);
    const row = rowStates.get(id) ?? EMPTY_ROW_STATE;
    const parsedInput = readDraftInput(fields, row.draft);
    if (!parsedInput.ok) {
      setRequestState(id, { kind: "invalid", message: parsedInput.message });
      return;
    }

    const requestToken = Symbol(id);
    requestTokensByActionId.current.set(id, requestToken);
    setRequestState(id, { kind: "pending" });
    try {
      const response = await callActionWithEncodingFallback(
        descriptor.segments,
        parsedInput.value,
        { base: actionsInfo?.base, appendTrailingSlash: actionsInfo?.appendTrailingSlash },
        acceptedEncodingsByActionId.current.get(id) ?? descriptor.accept,
      );

      if (requestTokensByActionId.current.get(id) !== requestToken) return;
      // Any answer but Astro's encoding rejection came through the action
      // itself — its own errors included — so that encoding is the one it
      // accepts.
      const endpointAcceptedEncoding =
        response.type !== "unreachable" && !isEncodingRejection(response);
      if (endpointAcceptedEncoding) acceptedEncodingsByActionId.current.set(id, response.encoding);
      setRequestState(id, { kind: "completed", response });
    } catch (error) {
      if (requestTokensByActionId.current.get(id) !== requestToken) return;
      setRequestState(id, {
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (requestTokensByActionId.current.get(id) === requestToken) {
        requestTokensByActionId.current.delete(id);
      }
    }
  };

  return {
    rowStates,
    fieldsByActionId,
    toggleAction,
    updateInputDraft,
    callAction,
  };
}

/** Stable identity for an action that preserves export-segment boundaries. */
export function actionId(segments: readonly string[]): string {
  return JSON.stringify(segments);
}

function readDraftInput(
  fields: ActionField[] | undefined,
  draft: ActionInputDraft,
): DraftInputResult {
  if (fields) {
    return readFieldValues(fields, (name) => draft.fields[name]);
  }

  const text = draft.json.trim();
  if (text === "") return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      message: `The input is not valid JSON. ${error instanceof Error ? error.message : ""}`,
    };
  }
}
