<template>
  <!-- 完全复制现有monitor-ui.html的结构 -->
  <div class="monitor-container">
    <!-- 头部 -->
    <div class="header">
      <div class="logo">
        🛡️ AEGIS
      </div>
      <div class="subtitle">AI Agent 实时安全监控系统 (Vue + NestJS)</div>
      <div class="lang-controls">
        <button id="lang-switch" @click="toggleLanguage">{{ language === 'zh' ? 'EN' : '中文' }}</button>
      </div>
      <div
        class="connection-status"
        :class="{ connected: connected, disconnected: !connected }"
      >
        {{ connected ? '已连接' : '连接断开' }}
      </div>
    </div>

    <!-- 统计区域 -->
    <div class="stats-container">
      <div class="stat-card stat-total" @click="refreshData">
        <div class="stat-number">{{ stats.total }}</div>
        <div class="stat-label">{{ texts.totalEvents }}</div>
      </div>
      <div class="stat-card stat-blocked">
        <div class="stat-number">{{ stats.blocked }}</div>
        <div class="stat-label">{{ texts.commandsBlocked }}</div>
      </div>
      <div class="stat-card stat-allowed">
        <div class="stat-number">{{ stats.allowed }}</div>
        <div class="stat-label">{{ texts.commandsAllowed }}</div>
      </div>
      <div class="stat-card stat-warning">
        <div class="stat-number">{{ stats.warning }}</div>
        <div class="stat-label">{{ texts.warnings }}</div>
      </div>
      <div class="stat-card stat-pending">
        <div class="stat-number">{{ stats.pending }}</div>
        <div class="stat-label">{{ texts.pendingReview }}</div>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="main-content">
      <!-- 活跃代理面板 -->
      <div class="panel agents-panel">
        <div class="panel-header">{{ texts.activeAgents }}</div>
        <div class="panel-content">
          <div v-if="agents.length === 0" class="empty-state">
            {{ texts.noActiveAgents }}
          </div>
          <div
            v-for="agent in agents"
            :key="agent.type"
            class="agent-item"
          >
            <div class="agent-name">{{ agent.type }}</div>
            <div class="agent-meta">
              会话: {{ agent.sessionCount }} | 最后活跃: {{ formatTime(agent.lastActivity) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 活跃会话面板 -->
      <div class="panel sessions-panel">
        <div class="panel-header">{{ texts.activeSessions }}</div>
        <div class="panel-content">
          <div v-if="sessions.length === 0" class="empty-state">
            {{ texts.noActiveSessions }}
          </div>
          <div
            v-for="session in sessions"
            :key="session.id"
            class="session-item"
          >
            <div class="session-id">{{ session.id.slice(0, 8) }}...</div>
            <div class="session-meta">
              {{ session.agent }} | 事件: {{ session.eventCount }} | {{ formatTime(session.lastActivity) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 安全事件面板 -->
      <div class="panel events-panel">
        <div class="panel-header events-header">{{ texts.securityEvents }}</div>
        <div class="panel-content events-content">
          <div v-if="events.length === 0" class="empty-state">
            {{ texts.waitingForEvents }}
          </div>
          <div
            v-for="event in events"
            :key="event.id"
            class="event-item"
          >
            <div class="event-meta">
              <span class="event-time">{{ formatTime(event.timestamp) }}</span>
              <span class="risk-badge" :class="`risk-${event.risk.toLowerCase()}`">
                {{ event.risk }}
              </span>
              <span class="status-badge" :class="`status-${event.status}`">
                {{ event.status }}
              </span>
              <span class="agent-tag">{{ event.agent }}</span>
            </div>
            <div class="command-text">{{ event.command }}</div>
            <div v-if="event.description" class="event-description">
              {{ event.description }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 状态栏 -->
    <div class="status-bar">
      <span>{{ texts.realTimeMonitoring }}</span>
      <span>{{ formatTime(new Date().toISOString()) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWebSocketStore } from '@/stores/websocket'
import dayjs from 'dayjs'

const websocketStore = useWebSocketStore()
const language = ref('zh')

const connected = computed(() => websocketStore.connected)
const stats = computed(() => websocketStore.stats)
const events = computed(() => websocketStore.events)
const sessions = computed(() => websocketStore.sessions)
const agents = computed(() => websocketStore.agents)

// 多语言文本（复制原有的文本配置）
const texts = computed(() => {
  const translations = {
    zh: {
      subtitle: 'AI Agent 实时安全监控系统',
      totalEvents: '总事件',
      commandsBlocked: '已阻止',
      commandsAllowed: '已允许',
      warnings: '警告',
      pendingReview: '待审批',
      activeAgents: '活跃代理',
      activeSessions: '活跃会话',
      securityEvents: '安全事件',
      noActiveAgents: '暂无活跃代理',
      noActiveSessions: '暂无活跃会话',
      waitingForEvents: '等待安全事件...',
      realTimeMonitoring: '实时监控中',
      langSwitch: 'EN',
      testSimulate: '测试模拟',
    },
    en: {
      subtitle: 'AI Agent Real-time Security Monitoring',
      totalEvents: 'Total Events',
      commandsBlocked: 'Blocked',
      commandsAllowed: 'Allowed',
      warnings: 'Warnings',
      pendingReview: 'Pending',
      activeAgents: 'Active Agents',
      activeSessions: 'Active Sessions',
      securityEvents: 'Security Events',
      noActiveAgents: 'No Active Agents',
      noActiveSessions: 'No Active Sessions',
      waitingForEvents: 'Waiting for events...',
      realTimeMonitoring: 'Real-time Monitoring',
      langSwitch: '中文',
      testSimulate: 'Test Simulate',
    }
  }
  return translations[language.value]
})

const formatTime = (timestamp: string) => {
  return dayjs(timestamp).format('HH:mm:ss')
}

const toggleLanguage = () => {
  language.value = language.value === 'zh' ? 'en' : 'zh'
}

const refreshData = () => {
  if (websocketStore.socket) {
    websocketStore.socket.emit('get_stats')
  }
}

onMounted(() => {
  // 页面标题设置
  document.title = 'Aegis 安全监控 - Vue + NestJS'
})
</script>

<style scoped>
/* 使用全局样式，无需额外样式 */
</style>