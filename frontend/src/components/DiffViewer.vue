<template>
  <div class="diff-viewer">
    <div
      v-for="(line, i) in parsedLines"
      :key="i"
      class="diff-line"
      :class="line.type"
    >
      <span class="diff-gutter">{{ line.gutter }}</span>
      <span class="diff-content">{{ line.content }}</span>
    </div>
    <div v-if="parsedLines.length === 0" class="diff-empty">
      No changes
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  patch: { type: String, required: true },
})

const parsedLines = computed(() => {
  if (!props.patch) return []
  return props.patch.split('\n').map(line => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return { type: 'file-header', gutter: ' ', content: line }
    }
    if (line.startsWith('@@')) {
      return { type: 'hunk', gutter: '@@', content: line }
    }
    if (line.startsWith('+')) {
      return { type: 'add', gutter: '+', content: line.slice(1) }
    }
    if (line.startsWith('-')) {
      return { type: 'del', gutter: '-', content: line.slice(1) }
    }
    return { type: 'ctx', gutter: ' ', content: line.slice(1) || line }
  })
})
</script>

<style scoped>
.diff-viewer {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
  line-height: 1.5;
  overflow-x: auto;
  background: #0a0f1e;
  border: 1px solid var(--border);
}

.diff-line {
  display: flex;
  white-space: pre;
  min-width: max-content;
}

.diff-line.add {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
}

.diff-line.del {
  background: rgba(220, 38, 38, 0.12);
  color: #f87171;
}

.diff-line.hunk {
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
}

.diff-line.file-header {
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
}

.diff-line.ctx {
  color: var(--text-secondary);
}

.diff-gutter {
  display: inline-block;
  width: 1.5rem;
  text-align: center;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 0 0.25rem;
  opacity: 0.7;
  user-select: none;
}

.diff-content {
  padding: 0 0.75rem;
}

.diff-empty {
  padding: 1rem;
  text-align: center;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
}
</style>
