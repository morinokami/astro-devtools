import type { ComponentChildren } from "preact";

import { Caption } from "./Caption.tsx";

/** Render the title and explanation of a panel state: empty, loading, failed, or unavailable. */
export function StateNote({
  title,
  class: className,
  children,
}: {
  title: string;
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <div class={className}>
      <p class="mb-1.5 text-bright">{title}</p>
      <Caption>{children}</Caption>
    </div>
  );
}
