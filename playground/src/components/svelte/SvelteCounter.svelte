<script lang="ts">
  let { start }: { start: number } = $props();
  let count = $state(start);
</script>

<button type="button" onclick={() => (count += 1)}>
  svelte count: {count}
</button>
