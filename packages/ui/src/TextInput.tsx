/** A single-line text entry control with native input attributes. */

import type { JSX } from "preact";

import { cn } from "cn";

import { fieldVariants } from "./field-variants.ts";

/** Render a text-like input (`text`, `search`, …) on the shared field surface. */
export function TextInput({
  size = "md",
  class: className,
  ...props
}: Omit<JSX.IntrinsicElements["input"], "class" | "className" | "size"> & {
  /** `sm` matches the box of a `Chip`, for an input that shares a toolbar row with chips. */
  size?: "md" | "sm";
  class?: string;
}) {
  return <input {...props} class={cn(fieldVariants({ size }), className)} />;
}
