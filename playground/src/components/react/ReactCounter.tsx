/** @jsxImportSource react */
import { useState } from "react";

export default function ReactCounter({ start }: { start: number }) {
  const [count, setCount] = useState(start);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      react count: {count}
    </button>
  );
}
