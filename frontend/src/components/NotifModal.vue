<template>
  <!-- 通知权限模态框 -->
  <div v-if="showNotifModal" class="approval-modal">
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">🔔 {{ currentTexts.notifModalTitle }}</div>
        <div class="modal-meta">
          <span class="session-info">aegis · security monitor</span>
        </div>
      </div>
      <div class="modal-body">
        <div class="command-section">
          <div class="command-label">{{ currentTexts.notifModalWhy }}</div>
          <div class="command-display">{{ currentTexts.notifModalBody }}</div>
        </div>
        <div class="command-section" style="margin-top: 1rem;">
          <div class="tip-display">{{ currentTexts.notifModalBodyTip }}</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="action-btn action-deny" @click="$emit('skip')">
          {{ currentTexts.notifSkip }}
        </button>
        <button class="action-btn action-approve" @click="$emit('grant')">
          {{ currentTexts.notifEnable }}
        </button>
      </div>
    </div>
  </div>

  <!-- 通知权限被拒绝 - 设置指引模态框 -->
  <div v-if="showNotifGuide" class="approval-modal">
    <div class="modal-backdrop" @click="$emit('close-guide')"></div>
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">{{ currentTexts.notifDeniedTitle }}</div>
        <div class="modal-meta">
          <span class="session-info">aegis · security monitor</span>
        </div>
      </div>
      <div class="modal-body">
        <div class="command-section">
          <div class="command-label">{{ currentTexts.notifDeniedBrowserLabel }}</div>
          <div class="command-display">
            {{ currentTexts.notifDeniedChrome }}<br><br>
            {{ currentTexts.notifDeniedEdge }}<br><br>
            {{ currentTexts.notifDeniedSafari }}
          </div>
        </div>
        <div class="command-section" style="margin-top:1.5rem">
          <div class="command-label">{{ currentTexts.notifDeniedMacLabel }}</div>
          <div class="command-display">
            {{ currentTexts.notifDeniedMac }}
          </div>
        </div>
        <div class="details-grid" style="margin-top:1rem">
          <div class="detail-item">
            <span class="detail-label">NOTE</span>
            <span class="detail-value">{{ currentTexts.notifDeniedRefresh }}</span>
          </div>
        </div>
        <div class="test-section" style="margin-top:1.5rem">
          <button class="test-btn" @click="$emit('test-notif')">
            {{ currentTexts.notifTestBtn }}
          </button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="action-btn action-approve" @click="$emit('close-guide')">
          {{ currentTexts.notifDeniedBtn }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  showNotifModal: {
    type: Boolean,
    required: true,
  },
  showNotifGuide: {
    type: Boolean,
    required: true,
  },
  currentTexts: {
    type: Object,
    required: true,
  },
});

defineEmits(['grant', 'skip', 'close-guide', 'test-notif']);
</script>

<style scoped>
/* 审批模态框 - 极简风格 (shared modal styles) */
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

.tip-display {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid var(--info);
  border-left: 3px solid var(--info);
  padding: 0.8rem;
  color: var(--info);
  border-radius: 0 4px 4px 0;
  font-style: italic;
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

.test-section {
  text-align: center;
}

.test-btn {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--info);
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid var(--info);
  padding: 0.75rem 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.test-btn:hover {
  background: var(--info);
  color: white;
}
</style>
