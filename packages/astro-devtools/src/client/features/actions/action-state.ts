/** Shared state models for the Actions panel's editor rows and requests. */

import type { ActionResponse } from "./actions-call.ts";

/** Draft input kept while a row is collapsed or its metadata refreshes. */
export interface ActionInputDraft {
  /**
   * Control value per generated field name, read by `readFieldValues`: a
   * missing entry omits the field, and the sentinels in `action-form.ts`
   * stand for the values no typed text can mean.
   */
  fields: Record<string, string>;
  /** The raw JSON textarea's text. */
  json: string;
}

/** State shown in an action's request-status area. */
export type ActionRequestState =
  | { kind: "pending" }
  /** Input that the panel refused to send, with the reason why. */
  | { kind: "invalid"; message: string }
  /** An unexpected failure outside the states normalized by `callAction`. */
  | { kind: "failed"; message: string }
  | { kind: "completed"; response: ActionResponse };

/** UI state of one action row, keyed by `actionId`. */
export interface ActionRowState {
  expanded: boolean;
  draft: ActionInputDraft;
  /** The latest request state; absent before the first request. */
  requestState: ActionRequestState | undefined;
}

/** The state of a row that has never been touched. */
export const EMPTY_ROW_STATE: ActionRowState = {
  expanded: false,
  draft: { fields: {}, json: "" },
  requestState: undefined,
};
