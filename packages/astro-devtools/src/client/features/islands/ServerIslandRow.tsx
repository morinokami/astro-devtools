import { Badge, Row } from "@astro-devtools/ui";

import type { UnloadedServerIsland } from "./server-islands.ts";

/** Render a server island's name, request method, and why it is still listed. */
export function ServerIslandRow({ island }: { island: UnloadedServerIsland }) {
  return (
    <Row data-testid="server-island-row" class="flex flex-wrap items-center gap-2 p-2">
      <span class="mr-auto min-w-0 truncate font-mono text-bright">{`<${island.name}>`}</span>
      <Badge tone="purple">{island.method}</Badge>
      {island.state === "failed" ? (
        <Badge tone="red">failed · {island.status}</Badge>
      ) : (
        <Badge tone="gray">pending</Badge>
      )}
    </Row>
  );
}
