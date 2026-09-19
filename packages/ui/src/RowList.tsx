/** The divided rows of a card: the list that holds them and the row itself. */

import type { ComponentChildren, JSX } from "preact";

import { cn } from "cn";

/**
 * Render rows as a list that stays one for assistive technology. Preflight's
 * `list-style: none` makes WebKit drop the list semantics of a `ul`, so the
 * role is restated to keep the list announced under VoiceOver.
 */
export function RowList({
  class: className,
  children,
  ...props
}: Omit<JSX.IntrinsicElements["ul"], "children" | "class" | "className" | "role"> & {
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <ul {...props} role="list" class={cn("flex flex-col", className)}>
      {children}
    </ul>
  );
}

/**
 * Render one row. It owns only the divider above it and that divider's reset
 * on the first row — which is why a row must be a direct child of its list.
 * Layout and padding differ from panel to panel and stay with the caller.
 * `as="div"` serves a `dl`, whose rows wrap a term and its description.
 */
export function Row({
  as: Element = "li",
  class: className,
  children,
  ...props
}: Omit<JSX.HTMLAttributes<HTMLElement>, "children" | "class" | "className" | "ref"> & {
  as?: "li" | "div";
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <Element {...props} class={cn("border-t border-subtle first:border-t-0", className)}>
      {children}
    </Element>
  );
}
