import type { VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";

import { cva } from "class-variance-authority";
import { cn } from "cn";

/** Status colors chosen for contrast in both light and dark themes. */
const badgeVariants = cva(
  "inline-flex h-5 items-center justify-center rounded-sm border px-2 font-mono text-xs whitespace-nowrap",
  {
    variants: {
      tone: {
        purple: "border-accent text-lavender",
        gray: "border-body text-body",
        red: "border-[#b33e66] text-[light-dark(#b33e66,#f9c4d7)]",
        green: "border-[#3d7d1f] text-[light-dark(#3d7d1f,#d5f9c4)]",
        yellow: "border-[#b58a2d] text-[light-dark(#8a681c,#f9e9c4)]",
        blue: "border-[#3645d9] text-[light-dark(#3645d9,#bdc3ff)]",
      },
    },
  },
);

/** Supported badge colors, derived from the variant configuration. */
export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

/** Render a compact status label. */
export function Badge({
  tone,
  class: className,
  children,
}: {
  tone: BadgeTone;
  class?: string;
  children: ComponentChildren;
}) {
  return <span class={cn(badgeVariants({ tone }), className)}>{children}</span>;
}
