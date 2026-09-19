<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ start: number }>();
const count = ref(props.start);
</script>

<template>
  <button type="button" @click="count += 1">vue count: {{ count }}</button>
</template>
