<template>
  <div class="stats-grid">
    <div class="stat-card stat-total" @click="emitFilter('all')" :class="{ active: activeFilter === 'all' }">
      <div class="stat-number">{{ stats.total }}</div>
      <div class="stat-label">{{ currentTexts.totalEvents }}</div>
    </div>

    <div class="stat-card stat-blocked" @click="emitFilter('blocked')" :class="{ active: activeFilter === 'blocked' }">
      <div class="stat-number">{{ stats.blocked }}</div>
      <div class="stat-label">{{ currentTexts.commandsBlocked }}</div>
    </div>

    <div class="stat-card stat-allowed" @click="emitFilter('allowed')" :class="{ active: activeFilter === 'allowed' }">
      <div class="stat-number">{{ stats.allowed }}</div>
      <div class="stat-label">{{ currentTexts.commandsAllowed }}</div>
    </div>

    <div class="stat-card stat-pending" @click="emitFilter('pending')" :class="{ active: activeFilter === 'pending' }">
      <div class="stat-number">{{ stats.pending }}</div>
      <div class="stat-label">{{ currentTexts.pendingReview }}</div>
    </div>

    <div class="stat-card stat-timed-out" @click="emitFilter('timed_out')" :class="{ active: activeFilter === 'timed_out' }">
      <div class="stat-number">{{ stats.timed_out }}</div>
      <div class="stat-label">{{ currentTexts.timedOut }}</div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  stats: {
    type: Object,
    required: true,
  },
  currentTexts: {
    type: Object,
    required: true,
  },
  activeFilter: {
    type: String,
    default: 'all',
  },
});

const emit = defineEmits(['filter-by-status']);

const emitFilter = (status) => {
  // 再次点击同一个取消筛选
  const newFilter = props.activeFilter === status ? 'all' : status;
  emit('filter-by-status', newFilter);
};
</script>

<style scoped>
/* 状态统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 1.5rem;
  transition: all 0.3s ease;
  position: relative;
  cursor: pointer;
}

.stat-card.active {
  border-color: var(--accent-green);
  background: rgba(34, 197, 94, 0.05);
}

.stat-card.active::before {
  transform: scaleX(1);
}

.stat-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: var(--accent-green);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.3s ease;
}

.stat-card:hover::before {
  transform: scaleX(1);
}

.stat-card:hover {
  border-color: var(--border-accent);
  background: rgba(34, 197, 94, 0.02);
}

.stat-number {
  font-family: "Orbitron", monospace;
  font-size: 2rem;
  font-weight: 700;
  color: var(--accent-green);
  margin-bottom: 0.5rem;
  line-height: 1;
}

.stat-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  position: relative;
  padding-left: 0.75rem;
}

.stat-label::before {
  content: "—";
  position: absolute;
  left: 0;
  color: var(--accent-green);
}

/* 超时状态卡片特殊样式 */
.stat-timed-out .stat-number {
  color: #6b7280;
}

.stat-timed-out .stat-label::before {
  color: #6b7280;
}

.stat-timed-out:hover {
  background: rgba(107, 114, 128, 0.02);
}

.stat-timed-out::before {
  background: #6b7280;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
}
</style>
