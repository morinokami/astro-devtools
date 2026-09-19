/** The shared card surface, worn by `CardButton` and `CardLink`. */

import { cva } from "class-variance-authority";

export const cardVariants = cva(
  "block size-full rounded-lg border border-subtle bg-panel p-4 text-body no-underline shadow-card @max-[480px]/panel:p-3 [&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold [&_:is(h1,h2,h3,h4,h5,h6)]:text-bright",
  {
    variants: {
      interactive: {
        /* Match Astro's toolbar card hover in both themes. */
        true: "cursor-pointer hover:border-accent hover:bg-[light-dark(rgb(136_58_234/0.12),rgb(136_58_234/0.33))]",
        false: "",
      },
    },
    defaultVariants: { interactive: false },
  },
);
