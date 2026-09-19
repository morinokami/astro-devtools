/** A native choice control with native select attributes. */

import type { ComponentChildren, JSX } from "preact";

import { cn } from "cn";

import { fieldVariants } from "./field-variants.ts";

/**
 * Render a native select on the shared field surface. Unlike the text
 * controls it paints its own background: a native popup takes its colors from
 * the control, and a transparent one is not readable on every platform.
 */
export function Select({
  class: className,
  children,
  ...props
}: Omit<JSX.IntrinsicElements["select"], "children" | "class" | "className"> & {
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <select {...props} class={cn(fieldVariants({ size: "md" }), "bg-panel", className)}>
      {children}
    </select>
  );
}
