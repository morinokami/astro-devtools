import type { ComponentChildren } from "preact";

import { cn } from "cn";

/** Group related panel content in a static card. */
export function PanelCard({
  class: className,
  children,
}: {
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <div
      class={cn("rounded-lg border border-subtle bg-panel p-4 @max-[480px]/panel:p-3", className)}
    >
      {children}
    </div>
  );
}

/** Render the shared heading style used by panel cards. */
export function CardTitle({
  class: className,
  children,
}: {
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <h2
      class={cn(
        "mb-3 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase last:mb-0",
        className,
      )}
    >
      {children}
    </h2>
  );
}
