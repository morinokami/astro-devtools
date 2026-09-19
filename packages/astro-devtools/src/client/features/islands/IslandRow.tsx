import type { BadgeTone, IconComponent } from "@astro-devtools/ui";

import {
  Badge,
  Caption,
  PreactLogoIcon,
  ReactLogoIcon,
  Row,
  SolidLogoIcon,
  SourceLink,
  SvelteLogoIcon,
  VueLogoIcon,
} from "@astro-devtools/ui";

import type { IslandFramework, IslandInfo } from "./islands.ts";

import { hideHighlightOnRowLeave, showHighlight } from "../../platform/overlay.ts";

/** Framework icons and their accessible names. */
const FRAMEWORKS: Record<IslandFramework, { label: string; Icon: IconComponent }> = {
  preact: { label: "Preact", Icon: PreactLogoIcon },
  react: { label: "React", Icon: ReactLogoIcon },
  solid: { label: "SolidJS", Icon: SolidLogoIcon },
  svelte: { label: "Svelte", Icon: SvelteLogoIcon },
  vue: { label: "Vue", Icon: VueLogoIcon },
};

/** Badge tone per hydration state; the state's own name is the label. */
const STATE_TONES: Record<IslandInfo["state"], BadgeTone> = {
  hydrated: "green",
  failed: "red",
  pending: "gray",
};

/** Render one client island and highlight it on hover or keyboard focus. */
export function IslandRow({
  island,
  onOpen,
}: {
  island: IslandInfo;
  onOpen: (file: string) => Promise<void>;
}) {
  const framework = island.framework === undefined ? undefined : FRAMEWORKS[island.framework];
  /** Resolve the live child because a hydrated component may replace its root without a panel rescan. */
  const showIslandHighlight = (): void => {
    // astro-island uses `display: contents`, so highlight its first child when possible.
    showHighlight(island.element.firstElementChild ?? island.element);
  };
  return (
    <Row
      data-testid="island-row"
      class="flex flex-col gap-1 p-2 focus-within:rounded-xs focus-within:bg-accent/12 hover:rounded-xs hover:bg-accent/12"
      onPointerOver={showIslandHighlight}
      onPointerOut={hideHighlightOnRowLeave}
      onFocusIn={showIslandHighlight}
      onFocusOut={hideHighlightOnRowLeave}
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="mr-auto flex min-w-0 items-center gap-1.5">
          {framework ? (
            <span
              data-testid="island-framework"
              role="img"
              aria-label={framework.label}
              title={framework.label}
              class="shrink-0"
            >
              <framework.Icon class="h-4 w-4" />
            </span>
          ) : null}
          <span class="min-w-0 truncate font-mono text-bright">{`<${island.name}>`}</span>
        </span>
        {island.directive ? <Badge tone="purple">{island.directive}</Badge> : null}
        <Badge tone={STATE_TONES[island.state]}>{island.state}</Badge>
      </div>
      {island.displayPath ? (
        <SourceLink
          class="max-w-full self-start truncate font-mono"
          title={island.displayPath}
          onClick={() => void onOpen(island.editorPath ?? "")}
        >
          {island.displayPath}
        </SourceLink>
      ) : null}
      {island.propsSummary ? (
        <Caption class="truncate font-mono" title={`props: ${island.propsSummary}`}>
          props: {island.propsSummary}
        </Caption>
      ) : null}
    </Row>
  );
}
