import type { IconComponent } from "@astro-devtools/ui";
import type { ComponentChildren } from "preact";

import {
  AstroLogoIcon,
  CardButton,
  CardLink,
  FunctionIcon,
  SitemapIcon,
  ViteLogoIcon,
} from "@astro-devtools/ui";

import type { OverviewInfo } from "../../../types.ts";

import { ASTRO_DOCK_ENTRY_IDS } from "../../../dock-ids.ts";
import { pluralize } from "../../platform/text.ts";
import { formatVersion } from "./version.ts";

/** Show project versions and counts, with links to related panels. */
export function StatsGrid({
  overviewInfo,
  onOpenEntry,
}: {
  overviewInfo: OverviewInfo;
  /** Open the named Astro dock entry. */
  onOpenEntry: (id: string) => void;
}) {
  const astroVersion = versionStat("Astro", overviewInfo.astroVersion);
  const viteVersion = versionStat("Vite", overviewInfo.viteVersion);
  return (
    <section class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 @max-[420px]/panel:grid-cols-1">
      <StatCard
        link="https://astro.build"
        accessibleName={astroVersion.accessibleName}
        icon={AstroLogoIcon}
      >
        {/* Used by the end-to-end tests to detect a mounted panel. */}
        <VersionValue id="astro-version">{astroVersion.value}</VersionValue>
      </StatCard>
      <StatCard
        link="https://vite.dev"
        accessibleName={viteVersion.accessibleName}
        icon={ViteLogoIcon}
      >
        <VersionValue>{viteVersion.value}</VersionValue>
      </StatCard>
      <StatCard onClick={() => onOpenEntry(ASTRO_DOCK_ENTRY_IDS.routes)} icon={SitemapIcon}>
        <StatLabel>{formatCount(overviewInfo.counts.pages, "page")}</StatLabel>
      </StatCard>
      <StatCard onClick={() => onOpenEntry(ASTRO_DOCK_ENTRY_IDS.actions)} icon={FunctionIcon}>
        <StatLabel>
          <ActionsLabel overviewInfo={overviewInfo} />
        </StatLabel>
      </StatCard>
    </section>
  );
}

/** Render one linked or clickable project statistic. */
function StatCard({ link, onClick, accessibleName, icon: Icon, children }: StatCardProps) {
  const content = (
    <span class="flex h-full flex-col items-center justify-center gap-2.5 text-center">
      <Icon class="size-7.5 text-muted" />
      {children}
    </span>
  );
  if (link !== undefined) {
    return (
      <CardLink href={link} aria-label={accessibleName} class="min-h-32">
        {content}
      </CardLink>
    );
  }
  return (
    <CardButton onClick={onClick} class="min-h-32">
      {content}
    </CardButton>
  );
}

type StatCardProps = {
  icon: IconComponent;
  children: ComponentChildren;
} & (
  | { link: string; accessibleName: string; onClick?: never }
  | { link?: never; accessibleName?: never; onClick: () => void }
);

/** Derive visible and accessible version labels from the same formatted value. */
function versionStat(product: string, version: string | undefined) {
  const value = formatVersion(version);
  return value === undefined
    ? { value: "unknown", accessibleName: `${product} version unknown` }
    : { value, accessibleName: `${product} ${value}` };
}

function formatCount(count: number, noun: string) {
  return (
    <>
      <StatNumber>{count}</StatNumber> {pluralize(count, noun)}
    </>
  );
}

/** Show the action count, or only its presence when the file could not load. */
function ActionsLabel({ overviewInfo }: { overviewInfo: OverviewInfo }) {
  if (overviewInfo.counts.actions !== undefined)
    return formatCount(overviewInfo.counts.actions, "action");
  if (overviewInfo.actionsFile) return <StatNumber>actions</StatNumber>;
  return formatCount(0, "action");
}

/** Render a product version as the primary value of a stat card. */
function VersionValue({ id, children }: { id?: string; children: ComponentChildren }) {
  return (
    <span id={id} class="font-mono text-[15px] text-bright">
      {children}
    </span>
  );
}

/** Render the readable phrase inside a count stat card. */
function StatLabel({ children }: { children: ComponentChildren }) {
  return <span class="text-[15px]">{children}</span>;
}

/** Emphasize the variable part of a count stat. */
function StatNumber({ children }: { children: ComponentChildren }) {
  return <span class="font-semibold text-bright">{children}</span>;
}
