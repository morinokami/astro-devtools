import { useState } from "preact/hooks";

export default function PreactCounter({ start }: { start: number }) {
  const [count, setCount] = useState(start);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      count: {count}
    </button>
  );
}
