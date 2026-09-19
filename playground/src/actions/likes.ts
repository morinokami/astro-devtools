import { z } from "astro/zod";
import { defineAction } from "astro:actions";

// These actions are defined outside index.ts on purpose, following the
// split-file layout that Astro's actions guide recommends. The Actions
// panel must still pick up their accept and input metadata;
// e2e/rpc.test.ts has a test for this.
export const likes = {
  add: defineAction({
    input: z.object({ post: z.string() }),
    handler: async ({ post }) => ({ post, likes: 1 }),
  }),
};
