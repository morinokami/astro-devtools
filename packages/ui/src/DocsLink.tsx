import type { ComponentChildren } from "preact";

import { cn } from "cn";

import { ExternalLink } from "./ExternalLink.tsx";

/** Render an external documentation link inside running text. */
export function DocsLink({
  href,
  class: className,
  children,
}: {
  href: string;
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <ExternalLink href={href} class={cn("text-lavender underline", className)}>
      {children}
    </ExternalLink>
  );
}
