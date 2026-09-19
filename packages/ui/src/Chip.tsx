import type { ComponentChildren } from "preact";

import { cn } from "cn";

/** Render a toggle button with an accessible pressed state. */
export function Chip({
  pressed,
  onClick,
  class: className,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      class={cn(
        "cursor-pointer rounded-full border border-control px-2.5 py-1 text-xs hover:border-muted hover:text-bright aria-pressed:border-[#e0ccfa]/33 aria-pressed:bg-accent aria-pressed:text-white",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
