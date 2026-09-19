/**
 * The shared form-control surface, worn by `TextInput`, `Select`, and
 * `TextArea`. A placeholder often carries real information (a schema
 * default), so it takes the muted text color instead of the browser's
 * half-transparent version of the control's own color. `min-w-0` lets a
 * control become narrower than its intrinsic width inside a flex or grid row.
 */

import { cva } from "class-variance-authority";

export const fieldVariants = cva(
  "min-w-0 rounded-md border border-control text-xs text-bright placeholder:text-muted focus-visible:border-muted",
  {
    variants: {
      /* The box of a single-line control; `TextArea` pads itself. */
      size: {
        md: "px-2 py-1.5",
        /* The box of a `Chip`, for a control that shares a toolbar row with chips. */
        sm: "px-2.5 py-1",
      },
    },
  },
);
