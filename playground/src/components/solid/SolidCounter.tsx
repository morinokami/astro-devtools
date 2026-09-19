/** @jsxImportSource solid-js */
import { createSignal } from "solid-js";

export default function SolidCounter(props: { start: number }) {
  const [count, setCount] = createSignal(props.start);
  return (
    <button type="button" onClick={() => setCount(count() + 1)}>
      solid count: {count()}
    </button>
  );
}
