/** A card-shaped button with native button attributes. */

import type { ComponentChildren, JSX } from "preact";

import { cn } from "cn";

import { cardVariants } from "./card-variants.ts";

/** Render an interactive card as a button. */
export function CardButton({
  type = "button",
  class: className,
  children,
  ...props
}: Omit<JSX.IntrinsicElements["button"], "children" | "class" | "className"> & {
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <button
      {...props}
      type={type}
      class={cn(cardVariants({ interactive: true }), "text-left", className)}
    >
      {children}
    </button>
  );
}
