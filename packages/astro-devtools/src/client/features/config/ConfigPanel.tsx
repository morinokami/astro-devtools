import {
  Caption,
  CardTitle,
  PanelCard,
  PanelContent,
  PanelViewport,
  RequestNotes,
  Row,
  SourceFileCard,
} from "@astro-devtools/ui";

import type { ConfigEntry, ConfigInfo } from "../../../types.ts";
import type { PanelProps } from "../../platform/panel-shell.ts";

import { openInEditor } from "../../platform/editor.ts";
import { useRpcData } from "../../platform/hooks.ts";

/** Show the resolved Astro config and a link to its source file. */
export function ConfigPanel({ context, refreshKey }: PanelProps) {
  const configState = useRpcData(context, refreshKey, "astro-devtools:config:get");
  const configInfo = configState.data;
  const configFile = configInfo?.configFile;

  return (
    <PanelViewport class="text-sm">
      <PanelContent class="gap-3">
        <RequestNotes state={configState} label="Astro config" />
        {configInfo !== undefined && (
          <>
            {configFile !== undefined && (
              <SourceFileCard
                title="Config file"
                file={configFile}
                onOpen={() => openInEditor(configFile, configInfo.root)}
              />
            )}
            <AstroConfigCard configInfo={configInfo} />
          </>
        )}
      </PanelContent>
    </PanelViewport>
  );
}

/** Show resolved config entries after the RPC has completed. */
function AstroConfigCard({ configInfo }: { configInfo: ConfigInfo }) {
  const { entries } = configInfo;
  return (
    <PanelCard>
      <CardTitle>Astro config</CardTitle>
      {entries.length > 0 && (
        <dl>
          {entries.map((entry) => (
            <ConfigRow key={entry.key} entry={entry} />
          ))}
        </dl>
      )}
      {entries.length === 0 && <Caption>The Astro config has not been resolved yet.</Caption>}
    </PanelCard>
  );
}

/** Render one config key and value. */
function ConfigRow({ entry }: { entry: ConfigEntry }) {
  return (
    <Row
      as="div"
      data-testid="config-row"
      class="grid grid-cols-[minmax(120px,220px)_minmax(0,1fr)] gap-3 px-2 py-1.75 text-[13px] @max-[480px]/panel:grid-cols-1 @max-[480px]/panel:gap-0.5"
    >
      <dt class="font-mono text-muted">{entry.key}</dt>
      <dd class="font-mono wrap-anywhere text-bright">{entry.value}</dd>
    </Row>
  );
}
