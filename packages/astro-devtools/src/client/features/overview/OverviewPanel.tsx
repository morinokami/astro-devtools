import type { IconComponent } from "@astro-devtools/ui";

import {
  AstroLogoIcon,
  BugIcon,
  ExternalLink,
  PanelContent,
  PanelViewport,
  RequestNotes,
  StarIcon,
} from "@astro-devtools/ui";

import type { PanelProps } from "../../platform/panel-shell.ts";

import { useRpcData } from "../../platform/hooks.ts";
import { StatsGrid } from "./StatsGrid.tsx";
import { formatVersion } from "./version.ts";

const EXTERNAL_LINKS: {
  icon: IconComponent;
  name: string;
  link: string;
}[] = [
  {
    icon: StarIcon,
    name: "Star on GitHub",
    link: "https://github.com/morinokami/astro-devtools",
  },
  {
    icon: BugIcon,
    name: "Report a Bug",
    link: "https://github.com/morinokami/astro-devtools/issues",
  },
];

/** Show project versions and statistics, with links to the other panels. */
export function OverviewPanel({ context, refreshKey }: PanelProps) {
  const overviewState = useRpcData(context, refreshKey, "astro-devtools:overview:info");
  const overviewInfo = overviewState.data;
  const astroDevtoolsVersion = formatVersion(overviewInfo?.astroDevtoolsVersion);

  /** Open another entry in the Astro dock group. */
  const openEntry = (id: string): void => void context.docks.switchEntry(id);

  return (
    <PanelViewport class="text-base">
      <PanelContent class="my-auto gap-7">
        <section class="mt-2 flex flex-col items-center gap-2.5">
          <div class="flex items-center gap-4 @max-[420px]/panel:gap-3">
            <AstroLogoIcon class="h-10.5 w-auto @max-[420px]/panel:h-8.5" />
            <h1 class="text-[30px] font-bold tracking-[-0.02em] text-bright @max-[420px]/panel:text-[24px]">
              Astro{" "}
              <span class="bg-linear-90 from-[#D83333] to-[#F041FF] bg-clip-text text-transparent">
                DevTools
              </span>
            </h1>
          </div>
          {overviewInfo && (
            <p class="font-mono text-[13px] text-muted">
              astro-devtools
              {astroDevtoolsVersion === undefined ? "" : ` ${astroDevtoolsVersion}`}
            </p>
          )}
        </section>

        <RequestNotes state={overviewState} label="project overview" />
        {overviewInfo !== undefined && (
          <StatsGrid overviewInfo={overviewInfo} onOpenEntry={openEntry} />
        )}

        <footer class="mb-2 flex flex-wrap justify-center gap-x-7 gap-y-2">
          {EXTERNAL_LINKS.map(({ icon: Icon, name, link }) => (
            <ExternalLink
              key={link}
              class="flex items-center gap-2 text-sm font-medium whitespace-nowrap text-muted no-underline hover:text-bright"
              href={link}
            >
              <Icon class="size-[1.15em]" />
              {name}
            </ExternalLink>
          ))}
        </footer>
      </PanelContent>
    </PanelViewport>
  );
}
