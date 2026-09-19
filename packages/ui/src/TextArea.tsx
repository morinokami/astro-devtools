/** A multi-line text entry control with native textarea attributes. */

import type { JSX } from "preact";

import { cn } from "cn";

import { fieldVariants } from "./field-variants.ts";

/**
 * Render a textarea on the shared field surface. It resizes vertically only,
 * because a wider control would break out of its card.
 */
export function TextArea({
  class: className,
  ...props
}: Omit<JSX.IntrinsicElements["textarea"], "class" | "className"> & { class?: string }) {
  return <textarea {...props} class={cn(fieldVariants(), "resize-y p-2", className)} />;
}
