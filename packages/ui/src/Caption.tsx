import type { ComponentChildren, JSX } from "preact";

import { cn } from "cn";

/**
 * Render supporting text: 12px in the muted color, the pairing whose contrast
 * `--color-muted` is tuned for. A caption is its own block by default;
 * `as="span"` places it inside a line, beside a badge or a button.
 */
export function Caption({
  as: Element = "p",
  class: className,
  children,
  ...props
}: Omit<JSX.HTMLAttributes<HTMLElement>, "children" | "class" | "className" | "ref"> & {
  as?: "p" | "span";
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <Element {...props} class={cn("text-xs text-muted", className)}>
      {children}
    </Element>
  );
}
