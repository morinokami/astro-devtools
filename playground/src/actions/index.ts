import { z } from "astro/zod";
import { defineAction } from "astro:actions";

import { likes } from "./likes.ts";
import * as users from "./users.ts";

export const server = {
  greet: defineAction({
    input: z.object({ name: z.string() }),
    handler: async ({ name }) => `Hello, ${name}!`,
  }),
  feedback: {
    submit: defineAction({
      accept: "form",
      input: z.object({ message: z.string() }),
      handler: async ({ message }) => ({ received: message.length }),
    }),
  },
  // This action has one field for each kind of control the Actions panel
  // generates: a required text field, an optional number, a boolean with a
  // default value, an enum select, and an array (which the panel only
  // supports as JSON input). The last two fields take values a blank
  // control cannot mean — null, and the empty string as an enum member — so
  // the panel has to offer them as explicit choices.
  survey: defineAction({
    input: z.object({
      name: z.string().describe("Who is answering"),
      age: z.number().optional(),
      subscribed: z.boolean().default(false),
      color: z.enum(["red", "green", "blue"]).optional(),
      tags: z.array(z.string()).optional(),
      note: z.string().nullish(),
      layout: z.enum(["", "wide"]).optional(),
    }),
    handler: async (input) => input,
  }),
  // This action demonstrates the panel's documented limitation: a File value
  // cannot be entered in a generated control or written as JSON
  // (z.instanceof(File) has no JSON Schema equivalent), so the action shows
  // up in the panel but calling it from there always fails.
  upload: defineAction({
    accept: "form",
    input: z.object({ file: z.instanceof(File) }),
    handler: async ({ file }) => ({ name: file.name, size: file.size }),
  }),
  likes,
  users,
};
