/** A card-shaped `ExternalLink`. */

import { cn } from "cn";

import type { ExternalLinkProps } from "./ExternalLink.tsx";

import { cardVariants } from "./card-variants.ts";
import { ExternalLink, isNavigableLink } from "./ExternalLink.tsx";

/** Render an external link as a card, which is interactive only while the link navigates. */
export function CardLink({ href, class: className, children, ...props }: ExternalLinkProps) {
  return (
    <ExternalLink
      {...props}
      href={href}
      class={cn(cardVariants({ interactive: isNavigableLink(href) }), className)}
    >
      {children}
    </ExternalLink>
  );
}
