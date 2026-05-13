<template>
  <!-- 详细事件列表 -->
  <div class="events-section">
    <div class="events-header">
      <div class="events-title">{{ currentTexts.securityEvents }}</div>
      <div class="events-filters-wrap">
        <div class="events-filters">
          <button
            class="filter-btn"
            :class="{ active: eventFilter === 'all' }"
            @click="$emit('set-filter', 'all')"
          >ALL</button>
          <button
            class="filter-btn"
            :class="{ active: eventFilter === 'allowed' }"
            @click="$emit('set-filter', 'allowed')"
          >ALLOWED</button>
          <button
            class="filter-btn filter-btn-blocked"
            :class="{ active: eventFilter === 'blocked' }"
            @click="$emit('set-filter', 'blocked')"
          >BLOCKED</button>
          <button
            class="filter-btn filter-btn-pending"
            :class="{ active: eventFilter === 'pending' }"
            @click="$emit('set-filter', 'pending')"
          >PENDING</button>
          <button
            class="filter-btn filter-btn-timeout"
            :class="{ active: eventFilter === 'timed_out' }"
            @click="$emit('set-filter', 'timed_out')"
          >TIMEOUT</button>
        </div>
        <div class="time-filters">
          <button
            class="filter-btn filter-btn-time"
            :class="{ active: timeFilter === '1h' }"
            @click="$emit('set-time-filter', '1h')"
          >1H</button>
          <button
            class="filter-btn filter-btn-time"
            :class="{ active: timeFilter === '24h' }"
            @click="$emit('set-time-filter', '24h')"
          >24H</button>
          <button
            class="filter-btn filter-btn-time"
            :class="{ active: timeFilter === 'today' }"
            @click="$emit('set-time-filter', 'today')"
          >TODAY</button>
          <button
            class="filter-btn filter-btn-time"
            :class="{ active: timeFilter === 'all' }"
            @click="$emit('set-time-filter', 'all')"
          >ALL TIME</button>
        </div>
      </div>
    </div>
    <div class="events-detailed" @scroll="$emit('scroll', $event)">
      <div
        class="empty-state"
        v-if="events.length === 0"
        id="events-empty-state"
      >
        <div style="margin-bottom: 1rem">
          {{ currentTexts.waitingForEvents }}
        </div>
        <div
          class="connection-status-large"
          :class="{ connected: wsConnected, disconnected: !wsConnected }"
        >
          <div
            class="status-dot"
            id="status-dot-large"
            :style="{
              background: wsConnected ? 'var(--accent-green)' : 'var(--danger)',
            }"
          ></div>
          <span id="connection-text-large">
            {{
              wsConnected
                ? currentTexts.connectedActive
                : currentTexts.disconnectedCheck
            }}
          </span>
        </div>
      </div>

      <div
        v-for="event in filteredEvents"
        :key="event.id"
        class="event-item-detailed"
        :class="[event.status, { 'new-event': event.isNew }]"
      >
        <div class="event-status" :class="event.risk.toLowerCase()"></div>
        <div class="event-main">
          <div class="event-command">{{ event.command }}</div>
          <div class="event-context">
            <span class="context-tag agent-tag">{{ event.agent }}</span>
            <span class="context-tag"
              >{{ event.risk }} {{ currentTexts.risk }}</span
            >
            <span class="context-tag status-tag" :class="event.status">{{
              currentTexts[event.status] || event.status
            }}</span>
            <span v-if="event.decidedBy" class="context-tag source-tag" :class="event.decidedBy">
              {{ event.decidedBy === 'claude_code' ? '🤖 Claude' : '🛡️ Aegis' }}
            </span>
          </div>
          <div class="event-session-info">
            <span class="session-id">
              {{ currentTexts.session }}: {{ event.sessionId || currentTexts.unknown }}
            </span>
            <span
              v-if="event.taskId"
              class="task-id"
              :title="event.taskId"
            >TASK {{ event.taskId.slice(0, 8) }}</span>
          </div>
          <div v-if="event.matchedRules && event.matchedRules.length > 0" class="event-matched-rules">
            <span v-for="rule in event.matchedRules" :key="rule" class="matched-rule-tag">🎯 {{ rule }}</span>
          </div>
          <div v-if="event.userInput" class="event-user-input">
            👤 {{ event.userInput }}
          </div>
          <div v-if="event.assistPrompt" class="event-assist-prompt">
            🤖 {{ event.assistPrompt }}
          </div>
          <div class="event-user-context">{{ event.reason || event.description }}</div>

          <!-- AI 意图分析结果 -->
          <div v-if="event.aiAnalysis" class="event-ai-analysis">
            <span class="ai-rec-badge" :class="`rec-${event.aiAnalysis.recommendation}`">
              🤖 {{ event.aiAnalysis.recommendation.toUpperCase() }}
            </span>
            <span v-if="!event.aiAnalysis.intentMatch" class="ai-intent-mismatch">⚠ INTENT MISMATCH</span>
            <div class="ai-plain-text">{{ event.aiAnalysis.plainText }}</div>
            <div v-if="event.aiAnalysis.alerts?.length" class="ai-alerts-inline">
              <span v-for="alert in event.aiAnalysis.alerts" :key="alert" class="ai-alert-tag">⚠ {{ alert }}</span>
            </div>
          </div>

          <!-- 审批操作区域 -->
          <div v-if="event.status === 'pending' && event.approvalId" class="event-approval-actions">
            <button class="approval-btn approve-btn" @click="$emit('approve-event', event)">
              ✓ APPROVE
            </button>
            <button class="approval-btn deny-btn" @click="$emit('deny-event', event)">
              ✗ DENY
            </button>
          </div>
        </div>
        <div class="event-meta">
          <div class="event-time">{{ event.time }}</div>
          <div class="event-action">{{ event.action || 'unknown' }}</div>
          <div v-if="event.status === 'pending'" class="pending-indicator">
            ⏳ AWAITING APPROVAL
          </div>
        </div>
      </div>
    </div>

    <div v-if="isLoadingMore" class="load-more-indicator">⏳ loading...</div>
    <div v-else-if="!hasMoreEvents && events.length > 0" class="load-more-indicator no-more">— no more records —</div>
  </div>
</template>

<script setup>
defineProps({
  events: {
    type: Array,
    required: true,
  },
  filteredEvents: {
    type: Array,
    required: true,
  },
  eventFilter: {
    type: String,
    required: true,
  },
  timeFilter: {
    type: String,
    default: 'all',
  },
  isLoadingMore: {
    type: Boolean,
    required: true,
  },
  hasMoreEvents: {
    type: Boolean,
    required: true,
  },
  wsConnected: {
    type: Boolean,
    required: true,
  },
  currentTexts: {
    type: Object,
    required: true,
  },
});

defineEmits(['set-filter', 'set-time-filter', 'scroll', 'approve-event', 'deny-event']);
</script>

<style scoped>
/* 事件列表 - 超简约风格 */
.events-section {
  border: 1px solid var(--border);
  background: var(--bg-card);
}

.events-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(34, 197, 94, 0.05);
}

.events-title {
  font-family: "Orbitron", monospace;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--accent-green);
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

.events-filters-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.4rem;
}

.events-filters {
  display: flex;
  gap: 0.5rem;
}

.time-filters {
  display: flex;
  gap: 0.5rem;
}

.filter-btn-time:hover {
  border-color: #a78bfa;
  color: #a78bfa;
}

.filter-btn-time.active {
  background: #a78bfa;
  border-color: #a78bfa;
  color: var(--bg-primary);
}

.filter-btn {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.3rem 0.6rem;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-btn:hover {
  border-color: var(--accent-green);
  color: var(--accent-green);
}

.filter-btn.active {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: var(--bg-primary);
}

.filter-btn-blocked:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.filter-btn-blocked.active {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--bg-primary);
}

.filter-btn-pending:hover {
  border-color: var(--info);
  color: var(--info);
}

.filter-btn-pending.active {
  background: var(--info);
  border-color: var(--info);
  color: var(--bg-primary);
}

.filter-btn-timeout:hover {
  background: rgba(245, 158, 11, 0.1);
  border-color: #f59e0b;
  color: #f59e0b;
}

.filter-btn-timeout.active {
  background: #f59e0b;
  border-color: #f59e0b;
  color: var(--bg-primary);
}

.events-detailed {
  max-height: calc(100vh - 280px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--accent-green) transparent;
}

.events-detailed::-webkit-scrollbar {
  width: 4px;
}

.events-detailed::-webkit-scrollbar-track {
  background: transparent;
}

.events-detailed::-webkit-scrollbar-thumb {
  background: var(--accent-green);
  border-radius: 0;
}

.load-more-indicator {
  text-align: center;
  padding: 1rem;
  font-size: 0.65rem;
  font-family: "JetBrains Mono", monospace;
  color: var(--accent-green);
  letter-spacing: 0.1em;
}

.load-more-indicator.no-more {
  color: var(--text-secondary);
  opacity: 0.4;
}

/* 详细事件项 */
.event-item-detailed {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1rem;
  align-items: start;
  transition: background 0.2s ease;
}

.event-item-detailed:hover {
  background: rgba(255, 255, 255, 0.02);
}

.event-item-detailed:last-child {
  border-bottom: none;
}

.event-item-detailed.new-event {
  animation: slideInEvent 0.5s ease;
  background: rgba(34, 197, 94, 0.05);
}

@keyframes slideInEvent {
  from {
    opacity: 0;
    transform: translateX(-20px);
    background: rgba(34, 197, 94, 0.1);
  }
  to {
    opacity: 1;
    transform: translateX(0);
    background: rgba(34, 197, 94, 0.05);
  }
}

.event-status {
  width: 8px;
  height: 8px;
  background: var(--accent-green);
  flex-shrink: 0;
  margin-top: 0.5rem;
}

.event-status.critical {
  background: var(--danger);
  box-shadow: 0 0 8px rgba(220, 38, 38, 0.5);
}

.event-status.high {
  background: var(--warning);
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
}

.event-main {
  min-width: 0;
}

.event-command {
  font-family: "JetBrains Mono", monospace;
  color: var(--text-primary);
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.event-context {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.context-tag {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.context-tag.agent-tag {
  border-color: var(--border-accent);
}

.status-tag {
  display: inline-block;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.7rem;
}

.status-tag.allowed {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.status-tag.blocked {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.status-tag.pending {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.status-tag.timed_out {
  color: #6b7280;
  background: rgba(107, 114, 128, 0.1);
}

/* 决策来源标签 */
.source-tag {
  display: inline-block;
  font-weight: 600;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.source-tag.aegis_ui {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.source-tag.claude_code {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.25);
}

.event-session-info {
  margin-top: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.session-id {
  font-size: 0.7rem;
  color: #888;
  font-family: monospace;
  background: rgba(255, 255, 255, 0.05);
  padding: 0.2rem 0.5rem;
  border: 1px solid #333;
}

.event-matched-rules {
  margin-top: 0.4rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.matched-rule-tag {
  font-size: 0.7rem;
  color: #888;
  font-family: monospace;
  background: rgba(255, 255, 255, 0.05);
  padding: 0.2rem 0.5rem;
  border: 1px solid #333;
}

.task-id {
  font-size: 0.65rem;
  color: #a78bfa;
  font-family: monospace;
  background: rgba(167, 139, 250, 0.08);
  padding: 0.2rem 0.5rem;
  border: 1px solid rgba(167, 139, 250, 0.3);
  cursor: default;
  letter-spacing: 0.05em;
}

.task-id:hover {
  background: rgba(167, 139, 250, 0.15);
  border-color: rgba(167, 139, 250, 0.6);
}

.event-user-input {
  font-size: 0.72rem;
  color: #4ade80;
  margin-top: 0.35rem;
  padding: 0.3rem 0.5rem;
  border-left: 2px solid rgba(74, 222, 128, 0.4);
  background: rgba(74, 222, 128, 0.05);
  line-height: 1.4;
  word-break: break-word;
}

.event-assist-prompt {
  font-size: 0.72rem;
  color: #c4b5fd;
  margin-top: 0.35rem;
  padding: 0.3rem 0.5rem;
  border-left: 2px solid rgba(167, 139, 250, 0.4);
  background: rgba(167, 139, 250, 0.05);
  line-height: 1.4;
  word-break: break-word;
}

.event-user-context {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
  font-style: italic;
}

.event-ai-analysis {
  margin-top: 0.5rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid rgba(129, 140, 248, 0.25);
  background: rgba(129, 140, 248, 0.04);
  font-family: 'JetBrains Mono', monospace;
}

.ai-rec-badge {
  display: inline-block;
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border: 1px solid;
  margin-right: 0.5rem;
}

.ai-rec-badge.rec-approve {
  color: var(--accent-green);
  border-color: var(--accent-green);
  background: rgba(34, 197, 94, 0.08);
}

.ai-rec-badge.rec-caution {
  color: #f59e0b;
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
}

.ai-rec-badge.rec-deny {
  color: var(--danger);
  border-color: var(--danger);
  background: rgba(239, 68, 68, 0.08);
}

.ai-intent-mismatch {
  font-size: 0.62rem;
  color: #f59e0b;
  margin-right: 0.5rem;
}

.ai-plain-text {
  font-size: 0.72rem;
  color: var(--text-primary);
  margin-top: 0.35rem;
  line-height: 1.4;
}

.ai-alerts-inline {
  margin-top: 0.3rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.ai-alert-tag {
  font-size: 0.62rem;
  color: #f59e0b;
}

.event-meta {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-end;
}

.event-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-family: "JetBrains Mono", monospace;
}

.event-action {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0.25rem 0.5rem;
  border: 1px solid;
  background: rgba(34, 197, 94, 0.1);
  color: var(--accent-green);
  border-color: var(--accent-green);
}

.event-item-detailed.blocked .event-action {
  color: var(--danger);
  border-color: var(--danger);
  background: rgba(220, 38, 38, 0.1);
}

.event-item-detailed.warning .event-action {
  color: var(--warning);
  border-color: var(--warning);
  background: rgba(245, 158, 11, 0.1);
}

.event-item-detailed.pending .event-action {
  color: var(--info);
  border-color: var(--info);
  background: rgba(59, 130, 246, 0.1);
}

.event-item-detailed.timed_out .event-action {
  color: #f59e0b;
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

/* 事件列表中的审批操作 */
.event-approval-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.approval-btn {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.4rem 0.8rem;
  border: 1px solid;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.approve-btn {
  color: var(--accent-green);
  border-color: var(--accent-green);
}

.approve-btn:hover {
  background: var(--accent-green);
  color: var(--bg-primary);
}

.deny-btn {
  color: var(--danger);
  border-color: var(--danger);
}

.deny-btn:hover {
  background: var(--danger);
  color: white;
}

.pending-indicator {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  color: #f59e0b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(245, 158, 11, 0.1);
  padding: 0.25rem 0.5rem;
  border: 1px solid #f59e0b;
  animation: pending-pulse 2s ease-in-out infinite;
}

@keyframes pending-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

/* 大型连接状态指示器 */
.connection-status-large {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  margin: 1rem auto;
  max-width: 300px;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.connection-status-large #status-dot-large {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--danger);
  flex-shrink: 0;
}

.connection-status-large.connected #status-dot-large {
  background: var(--accent-green);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
  animation: online-pulse 2s ease-in-out infinite;
}

.connection-status-large.connected #connection-text-large {
  color: var(--accent-green);
}

.connection-status-large.disconnected #connection-text-large {
  color: var(--danger);
}

@keyframes online-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@media (max-width: 768px) {
  .event-item-detailed {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .event-meta {
    align-items: flex-start;
    text-align: left;
  }

  .context-tag {
    font-size: 0.6rem;
  }
}
</style>
