/**
 * An ARIA live region that mounts empty before publishing its content, so
 * assistive technologies observe every announcement as a change.
 */

import type { ComponentChildren } from "preact";

import { useEffect, useState } from "preact/hooks";

export function StatusAnnouncer({ children }: { children: ComponentChildren }) {
  const [announcement, setAnnouncement] = useState<ComponentChildren>("");

  // A pre-populated region inserted together with its text is not announced
  // consistently across assistive technologies. Centralizing the delayed
  // update keeps every consumer on the safe lifecycle by default.
  useEffect(() => setAnnouncement(children), [children]);

  return (
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </p>
  );
}
