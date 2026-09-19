import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  return Response.json({ message: "hello" });
};
