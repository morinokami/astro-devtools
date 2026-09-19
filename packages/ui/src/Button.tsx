import type { ComponentChildren } from "preact";

import { cn } from "cn";

/** Render an accent button that does not submit forms by default. */
export function Button({
  onClick,
  type = "button",
  inactive = false,
  class: className,
  children,
}: {
  onClick?: () => void;
  type?: "button" | "submit";
  /**
   * Refuse activation while keeping the control focusable. A native `disabled`
   * would blur the button the user just activated, and because the panel lives
   * in a shadow root, focus would land on the host page instead of returning
   * to the panel.
   */
  inactive?: boolean;
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <button
      type={type}
      aria-disabled={inactive || undefined}
      class={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-sm border border-[#e0ccfa]/33 bg-accent px-2 py-1 text-xs text-white aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
        className,
      )}
      onClick={(event) => {
        // Unlike native `disabled`, `aria-disabled` does not stop a submit
        // button from submitting its form, so refuse the click here.
        if (inactive) {
          event.preventDefault();
          return;
        }
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}
