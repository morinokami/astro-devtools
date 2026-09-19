import { defineMiddleware } from "astro:middleware";

/**
 * A no-op middleware: exists so the Overview and Routes panels have a
 * detected middleware file (`src/middleware.ts`) to show.
 */
export const onRequest = defineMiddleware((_context, next) => {
  return next();
});
