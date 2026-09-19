/**
 * The button that shows and hides a region, with the whole disclosure
 * contract in one place: `aria-expanded` carries the state, `aria-controls`
 * names the region, and the ▼/▶ marker repeats the state for sighted users.
 * The look stays with the caller, which passes a `class` and any native
 * button attribute through.
 */

import type { ComponentChildren, JSX } from "preact";

import { cn } from "cn";

export function DisclosureButton({
  expanded,
  controls,
  marker = "start",
  class: className,
  children,
  ...props
}: Omit<
  JSX.IntrinsicElements["button"],
  "children" | "class" | "className" | "type" | "aria-expanded" | "aria-controls"
> & {
  expanded: boolean;
  /** `id` of the region this button shows and hides. */
  controls: string;
  /** The side of the label the marker sits on. */
  marker?: "start" | "end";
  class?: string;
  children: ComponentChildren;
}) {
  const triangle = <DisclosureTriangle expanded={expanded} />;
  return (
    <button
      {...props}
      type="button"
      aria-expanded={expanded}
      // Panels unmount a collapsed region rather than hide it, so the region
      // is only referenced while it exists.
      aria-controls={expanded ? controls : undefined}
      class={cn("flex w-full cursor-pointer items-center gap-2 text-left", className)}
    >
      {marker === "start" && triangle}
      {children}
      {marker === "end" && triangle}
    </button>
  );
}

/** The ▼/▶ marker. Hidden from assistive technology because `aria-expanded` already carries the state. */
function DisclosureTriangle({ expanded }: { expanded: boolean }) {
  return (
    <span class="text-[10px] text-muted" aria-hidden="true">
      {expanded ? "▼" : "▶"}
    </span>
  );
}
