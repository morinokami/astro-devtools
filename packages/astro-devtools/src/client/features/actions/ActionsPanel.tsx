import {
  Caption,
  CardTitle,
  DocsLink,
  PanelCard,
  PanelContent,
  PanelViewport,
  RequestNotes,
  RowList,
  SourceFileCard,
  StateNote,
} from "@astro-devtools/ui";

import type { PanelProps } from "../../platform/panel-shell.ts";

import { openInEditor } from "../../platform/editor.ts";
import { useRpcData } from "../../platform/hooks.ts";
import { countOf } from "../../platform/text.ts";
import { EMPTY_ROW_STATE } from "./action-state.ts";
import { ActionRow } from "./ActionRow.tsx";
import { actionPath } from "./actions-call.ts";
import { actionId, useActionCallState } from "./use-action-call-state.ts";

/** List project actions and provide input editors for calling their real dev endpoints. */

const ACTIONS_DOCS_URL = "https://docs.astro.build/en/guides/actions/";

export function ActionsPanel({ context, refreshKey }: PanelProps) {
  const actionsState = useRpcData(context, refreshKey, "astro-devtools:actions:list");
  const actionsInfo = actionsState.data;
  const state = useActionCallState(actionsInfo);

  const actionsFile = actionsInfo?.actionsFile;
  const actions = actionsInfo?.actions;
  const endpointOptions = {
    base: actionsInfo?.base,
    appendTrailingSlash: actionsInfo?.appendTrailingSlash,
  };
  return (
    <PanelViewport class="text-sm">
      <PanelContent class="gap-3">
        <RequestNotes state={actionsState} label="actions" />
        {actionsFile !== undefined && (
          <SourceFileCard
            title="Actions file"
            file={actionsFile}
            onOpen={() => openInEditor(actionsFile, actionsInfo?.root)}
          />
        )}
        {actionsInfo !== undefined && (
          <PanelCard>
            {actions !== undefined && actions.length > 0 && (
              <>
                <CardTitle>{countOf(actions.length, "action")}</CardTitle>
                <Caption class="mb-3">
                  Expand an action to call it. The call POSTs to the action's real dev-server
                  endpoint, so input validation and middleware run exactly as in the app.
                </Caption>
                <RowList>
                  {actions.map((descriptor) => {
                    const id = actionId(descriptor.segments);
                    const fields = state.fieldsByActionId.get(id);
                    const row = state.rowStates.get(id) ?? EMPTY_ROW_STATE;
                    return (
                      <ActionRow
                        key={id}
                        qualifiedName={descriptor.qualifiedName}
                        fields={fields}
                        endpoint={actionPath(descriptor.segments, endpointOptions)}
                        expanded={row.expanded}
                        draft={row.draft}
                        requestState={row.requestState}
                        onToggle={() => state.toggleAction(id)}
                        onFieldInput={(name, value) =>
                          state.updateInputDraft(id, (draft) => ({
                            ...draft,
                            fields: { ...draft.fields, [name]: value },
                          }))
                        }
                        onJsonInput={(value) =>
                          state.updateInputDraft(id, (draft) => ({ ...draft, json: value }))
                        }
                        onCall={() => void state.callAction(descriptor)}
                      />
                    );
                  })}
                </RowList>
              </>
            )}
            {actionsFile === undefined && (
              <StateNote title="No actions file.">
                Astro Actions are server functions you define in{" "}
                <span class="font-mono">src/actions/index.ts</span> and call from anywhere on the
                client, with types and validation carried across. <ActionsDocsLink />
              </StateNote>
            )}
            {actionsFile !== undefined && actions === undefined && (
              <StateNote title="Could not load the actions file.">
                The dev server failed to import it, so what it defines is unknown. The import error
                is in the dev server output.
              </StateNote>
            )}
            {actions !== undefined && actions.length === 0 && (
              <StateNote title="No actions in this file.">
                Its <span class="font-mono">server</span> export holds none; every action of the
                project is one entry in it. <ActionsDocsLink />
              </StateNote>
            )}
          </PanelCard>
        )}
      </PanelContent>
    </PanelViewport>
  );
}

/** Link used by action empty states. */
function ActionsDocsLink() {
  return <DocsLink href={ACTIONS_DOCS_URL}>Learn about actions</DocsLink>;
}
