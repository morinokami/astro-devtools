/** Render on the server, then deliberately fail during client hydration. */
export default function ThrowingIsland() {
  if (!import.meta.env.SSR) throw new Error("This client island fails on purpose.");
  return <p>This server-rendered island fails when the browser tries to hydrate it.</p>;
}
