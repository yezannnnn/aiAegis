<template>
  <!-- 审批模态框 -->
  <div v-if="currentApproval" class="approval-modal">
    <div class="modal-backdrop" @click="$emit('close')"></div>
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">🛡️ COMMAND APPROVAL REQUEST</div>
        <div class="modal-meta">
          <span class="session-info">{{ currentApproval.sessionId }}</span>
          <span class="risk-indicator" :class="`risk-${currentApproval.risk.toLowerCase()}`">
            {{ currentApproval.risk }}
          </span>
        </div>
      </div>
      <div class="modal-body">
        <div class="command-section">
          <div class="command-label">COMMAND</div>
          <div class="command-display">{{ currentApproval.command }}</div>
        </div>

        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">DIRECTORY</span>
            <span class="detail-value">{{ currentApproval.cwd || "/unknown" }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">AGENT</span>
            <span class="detail-value">{{ currentApproval.agent || "Claude Code" }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">REASON</span>
            <span class="detail-value">{{ currentApproval.reason || "Risk detected" }}</span>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="action-btn action-deny" @click="$emit('deny')">
          DENY
        </button>
        <button class="action-btn action-approve" @click="$emit('approve')">
          APPROVE
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  currentApproval: {
    type: Object,
    default: null,
  },
  currentTexts: {
    type: Object,
    required: true,
  },
});

defineEmits(['approve', 'deny', 'close']);
</script>

<style scoped>
/* 审批模态框 - 极简风格 */
.approval-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
}

.modal-content {
  background: var(--bg-primary);
  border: 1px solid var(--border-accent);
  width: 90%;
  max-width: 600px;
  position: relative;
  z-index: 1001;
}

.modal-header {
  background: rgba(34, 197, 94, 0.05);
  border-bottom: 1px solid var(--border);
  padding: 1.5rem;
}

.modal-title {
  font-family: 'Orbitron', monospace;
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent-green);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.5rem;
}

.modal-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.session-info {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border);
}

.risk-indicator {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.25rem 0.75rem;
  border: 1px solid;
}

.risk-indicator.risk-low {
  color: var(--accent-green);
  border-color: var(--accent-green);
  background: rgba(34, 197, 94, 0.1);
}

.risk-indicator.risk-medium {
  color: #f59e0b;
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.risk-indicator.risk-high {
  color: var(--danger);
  border-color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}

.modal-body {
  padding: 1.5rem;
}

.command-section {
  margin-bottom: 1.5rem;
}

.command-label {
  font-family: 'Orbitron', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent-green);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.5rem;
}

.command-display {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 1rem;
  color: var(--accent-green);
  word-break: break-all;
}

.details-grid {
  display: grid;
  gap: 1rem;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-label {
  font-family: 'Orbitron', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.detail-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: var(--text-primary);
  text-align: right;
  max-width: 60%;
  word-break: break-all;
}

.modal-actions {
  border-top: 1px solid var(--border);
  padding: 1.5rem;
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.action-btn {
  font-family: 'Orbitron', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 1rem 2rem;
  border: 1px solid;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
}

.action-approve {
  color: var(--accent-green);
  border-color: var(--accent-green);
}

.action-approve:hover {
  background: var(--accent-green);
  color: var(--bg-primary);
}

.action-deny {
  color: var(--danger);
  border-color: var(--danger);
}

.action-deny:hover {
  background: var(--danger);
  color: white;
}
</style>
