/**
 * A link that leaves the panel, with its two rules in one place: it opens in
 * a new tab without a referrer, and it navigates only to HTTP(S), because a
 * panel may build an `href` from project data. `DocsLink` and `CardLink` are
 * built on it; the look is the caller's `class`.
 */

import type { ComponentChildren, JSX } from "preact";

/**
 * Render the link. An unsafe URL loses only its navigation attributes; the
 * inert anchor retains every other native prop.
 */
export function ExternalLink({ href, class: className, children, ...props }: ExternalLinkProps) {
  if (isNavigableLink(href)) {
    return (
      <a {...props} class={className} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  // An anchor without `href` is generic, a role that may not be named, so a
  // labeled one falls back to a group.
  const labeled = props["aria-label"] !== undefined || props["aria-labelledby"] !== undefined;
  return (
    <a
      {...props}
      class={className}
      role={props.role === undefined && labeled ? "group" : props.role}
    >
      {children}
    </a>
  );
}

/**
 * Native anchor props as Preact types them for an anchor with an `href`,
 * whose `role` is limited to the ones a link may take; each of those also
 * holds once an unsafe URL leaves the anchor without one.
 */
export type ExternalLinkProps = Omit<
  Extract<JSX.IntrinsicElements["a"], { href: unknown }>,
  "children" | "class" | "className" | "href" | "target" | "rel"
> &
  Record<`data-${string}`, string | number | boolean | undefined> & {
    href: string;
    class?: string;
    children: ComponentChildren;
  };

/** Whether a URL, resolved like an `href`, leads to an HTTP(S) destination. */
export function isNavigableLink(value: string): boolean {
  try {
    const { protocol } = new URL(value, document.baseURI);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
