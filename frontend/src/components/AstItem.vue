<template>
  <div
    class="ast-item"
    :class="[typeClass, { selected }]"
    @click="$emit('toggle')"
  >
    <span class="ast-label">{{ item.label }}</span>
    <span class="ast-value" v-html="displayValue"></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  item: {
    id: string;
    type: string;
    label: string;
    value: string;
    displayValue: string;
    raw?: string;
  };
  selected: boolean;
}

const props = defineProps<Props>();
defineEmits(['toggle']);

const typeClass = computed(() => `ast-${props.item.type}`);

const displayValue = computed(() => {
  let val = props.item.displayValue;
  if (props.item.raw && props.item.type === 'flags') {
    val = props.item.raw;
  }
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
});
</script>

<style scoped>
.ast-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  margin: 0.35rem 0;
  border: 1px solid var(--border);
  transition: all 0.2s;
  cursor: pointer;
  font-size: 0.8rem;
}
.ast-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-accent);
}
.ast-item.selected {
  border-color: var(--accent-green);
  background: var(--accent-green-dim);
}
.ast-item.selected::after {
  content: "✓";
  margin-left: auto;
  color: var(--accent-green);
  font-weight: 700;
}
.ast-label {
  font-family: 'Orbitron', monospace;
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0.2rem 0.5rem;
  min-width: 80px;
  text-align: center;
}
.ast-binary .ast-label { color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }
.ast-subcommands .ast-label { color: #a78bfa; border: 1px solid rgba(167, 139, 250, 0.3); }
.ast-flags .ast-label { color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); }
.ast-arguments .ast-label { color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
.ast-value {
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-primary);
}
</style>
