import { z } from "astro/zod";
import { defineAction } from "astro:actions";

// This file is grouped into `server` as a module namespace
// (`import * as users`), not as an object literal like likes.ts. A namespace
// has a null prototype, so the Actions panel cannot recognize a group by
// "is a plain object" — Astro itself walks `server` until it reaches a
// function; e2e/rpc.test.ts has a test for this.

export const update = defineAction({
  input: z.object({ id: z.string() }),
  handler: async ({ id }) => ({ updated: id }),
});

export const remove = defineAction({
  input: z.object({ id: z.string() }),
  handler: async ({ id }) => ({ removed: id }),
});
