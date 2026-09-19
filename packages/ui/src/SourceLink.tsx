import type { ComponentChildren } from "preact";

import { cn } from "cn";

/** Render a button that looks like a link, usually for opening source files. */
export function SourceLink({
  onClick,
  title,
  class: className,
  children,
}: {
  onClick: () => void;
  title?: string;
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      title={title}
      class={cn(
        "cursor-pointer border-0 bg-transparent p-0 text-left text-inherit underline decoration-muted decoration-dashed underline-offset-2 hover:text-bright hover:decoration-current",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
