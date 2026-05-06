<template>
  <!-- Agent状态面板 -->
  <div class="agent-grid">
    <!-- 活跃Agent列表 -->
    <div class="agents-panel">
      <div class="panel-header">{{ currentTexts.activeAgents }}</div>
      <div class="agent-list">
        <div class="empty-state" v-if="activeAgents.length === 0">
          {{ currentTexts.noActiveAgents }}
        </div>
        <div
          v-for="agent in activeAgents
            .slice()
            .sort((a, b) => (b.commandCount ?? 0) - (a.commandCount ?? 0))"
          :key="agent.type"
          class="agent-item"
        >
          <div class="agent-icon">🤖</div>
          <div class="agent-info">
            <div class="agent-name">
              {{ agent.persona || agent.type }}
              <span class="agent-session-id" v-if="agent.sessionId">#{{ agent.sessionId.slice(0, 8) }}</span>
            </div>
            <div class="agent-stats">
              <span class="stat-item">
                <span class="stat-label">执行</span>
                <span class="stat-value">{{ agent.commandCount ?? 0 }}</span>
              </span>
              <span class="stat-divider">|</span>
              <span class="stat-item stat-blocked">
                <span class="stat-label">拦截</span>
                <span class="stat-value">{{ agent.blockedCount ?? 0 }}</span>
              </span>
            </div>
            <div class="agent-model" v-if="agent.model">
              🧠 {{ agent.model.replace('claude-', '').replace(/-\d{8}$/, '') }}
            </div>
            <div class="agent-cwd" v-if="agent.cwd" :title="agent.cwd">
              📁 {{ agent.cwd.split('/').slice(-2).join('/') }}
            </div>
            <div class="agent-last-cmd" v-if="agent.lastCommand" :title="agent.lastCommand">
              $ {{ agent.lastCommand.length > 40 ? agent.lastCommand.slice(0, 40) + '…' : agent.lastCommand }}
            </div>
          </div>
          <div
            class="agent-status"
            :class="{
              offline:
                Date.now() - new Date(agent.lastActivity).getTime() >
                5 * 60 * 1000,
            }"
          ></div>
        </div>
      </div>
    </div>

    <!-- 活跃会话（暂时注释，考虑与活跃代理合并）
    <div class="sessions-panel">
      <div class="panel-header">{{ currentTexts.activeSessions }}</div>
      <div class="session-list">
        <div class="empty-state" v-if="activeSessions.length === 0">
          {{ currentTexts.noActiveSessions }}
        </div>
        <div
          v-for="session in activeSessions
            .slice()
            .sort(
              (a, b) =>
                new Date(b.lastActivity).getTime() -
                new Date(a.lastActivity).getTime()
            )"
          :key="session.id"
          class="session-item"
        >
          <div class="session-id">{{ session.id }}</div>
          <div class="session-user">{{ session.agent || "Claude Code" }}</div>
          <div class="session-project">
            {{ currentTexts.eventCount }}: {{ session.eventCount }}
          </div>
          <div class="session-time">
            {{ new Date(session.lastActivity).toLocaleTimeString() }}
          </div>
          <div class="session-command" v-if="session.lastCommand">
            {{ session.lastCommand }}
          </div>
        </div>
      </div>
    </div>
    -->
  </div>
</template>

<script setup>
defineProps({
  activeAgents: {
    type: Array,
    required: true,
  },
  activeSessions: {
    type: Array,
    required: true,
  },
  currentTexts: {
    type: Object,
    required: true,
  },
});
</script>

<style scoped>
/* Agent面板网格 */
.agent-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  margin-bottom: 3rem;
}

/* 活跃Agent列表 */
.agents-panel,
.sessions-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  overflow: hidden;
}

.panel-header {
  background: rgba(34, 197, 94, 0.05);
  border-bottom: 1px solid var(--border);
  padding: 0.75rem 1rem;
  font-family: "Orbitron", monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--accent-green);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.agent-list,
.session-list {
  padding: 1rem;
  max-height: 300px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--accent-green) transparent;
}

.agent-list::-webkit-scrollbar,
.session-list::-webkit-scrollbar {
  width: 4px;
}

.agent-list::-webkit-scrollbar-track,
.session-list::-webkit-scrollbar-track {
  background: transparent;
}

.agent-list::-webkit-scrollbar-thumb,
.session-list::-webkit-scrollbar-thumb {
  background: var(--accent-green);
  border-radius: 0;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  transition: all 0.2s ease;
  position: relative;
}

.agent-item:hover {
  background: rgba(255, 255, 255, 0.02);
}

.agent-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  color: var(--text-primary);
  font-weight: 600;
  margin-bottom: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.agent-session-id {
  font-size: 0.65rem;
  color: var(--text-secondary);
  font-family: "JetBrains Mono", monospace;
  font-weight: 400;
}

.agent-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
}

.stat-label {
  color: var(--text-secondary);
}

.stat-value {
  color: var(--text-primary);
  font-weight: 600;
  font-family: "JetBrains Mono", monospace;
}

.stat-blocked .stat-value {
  color: #f87171;
}

.stat-divider {
  color: var(--border);
  font-size: 0.65rem;
}

.agent-model {
  font-size: 0.65rem;
  color: #a78bfa;
  font-family: "JetBrains Mono", monospace;
  margin-bottom: 0.2rem;
  opacity: 0.9;
}

.agent-cwd {
  font-size: 0.65rem;
  color: var(--accent-green);
  font-family: "JetBrains Mono", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;
}

.agent-last-cmd {
  font-size: 0.62rem;
  color: var(--text-secondary);
  font-family: "JetBrains Mono", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 0.2rem;
  opacity: 0.7;
}

.agent-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-green);
  flex-shrink: 0;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
  animation: online-pulse 2s ease-in-out infinite;
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

.agent-status.offline {
  background: var(--text-secondary);
  box-shadow: none;
  animation: none;
}

/* 会话信息 */
.session-item {
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  border-left: 3px solid var(--accent-green);
  background: rgba(255, 255, 255, 0.01);
}

.session-id {
  font-size: 0.8rem;
  color: var(--accent-green);
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.session-user,
.session-project {
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-bottom: 0.15rem;
}

.session-time {
  font-size: 0.6rem;
  color: var(--text-secondary);
}

.session-command {
  font-size: 0.65rem;
  color: var(--accent-green);
  font-family: "JetBrains Mono", monospace;
  margin-top: 0.25rem;
  padding: 0.25rem;
  background: rgba(34, 197, 94, 0.05);
  border-left: 2px solid var(--accent-green);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

@media (max-width: 1024px) {
  .agent-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}
</style>
