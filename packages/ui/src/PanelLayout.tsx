import type { ComponentChildren } from "preact";

import { cn } from "cn";

/** Provide the shared full-height, scrollable viewport for a panel. */
export function PanelViewport({
  class: className,
  children,
}: {
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <div
      class={cn(
        "flex h-full flex-col overflow-y-auto bg-panel p-6 font-sans text-body @max-[480px]/panel:p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Center panel content in a width-limited column. */
export function PanelContent({
  class: className,
  children,
}: {
  class?: string;
  children: ComponentChildren;
}) {
  return <div class={cn("mx-auto flex w-full max-w-[880px] flex-col", className)}>{children}</div>;
}
