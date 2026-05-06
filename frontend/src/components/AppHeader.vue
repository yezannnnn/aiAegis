<template>
  <div class="header">
    <div class="header-main">
      <h1 class="title">AEGIS</h1>
      <p class="subtitle">{{ currentTexts.subtitle }}</p>
    </div>
    <div class="header-controls">
      <button class="lang-switch" @click="$emit('toggle-language')">
        {{ currentTexts.langSwitch }}
      </button>
      <button
        class="notif-status"
        :class="notifPermission"
        @click="$emit('notif-click')"
      >
        {{ notifPermission === 'granted' ? currentTexts.notifGranted : notifPermission === 'denied' ? currentTexts.notifDenied : currentTexts.notifDefault }}
      </button>
      <div
        class="connection-status"
        :class="{ connected: wsConnected, disconnected: !wsConnected }"
      >
        {{ wsConnected ? currentTexts.connected : currentTexts.disconnected }}
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  wsConnected: {
    type: Boolean,
    required: true,
  },
  notifPermission: {
    type: String,
    required: true,
  },
  currentTexts: {
    type: Object,
    required: true,
  },
});

defineEmits(['toggle-language', 'notif-click']);
</script>

<style scoped>
/* 主标题 - 极简线条风格 */
.header {
  margin-bottom: 3rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-main {
  flex: 1;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  position: relative;
}

/* 语言切换按钮 */
.lang-switch {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.7rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  position: relative;
}

.lang-switch:hover {
  border-color: var(--border-accent);
  color: var(--accent-green);
  background: rgba(34, 197, 94, 0.05);
}

.lang-switch::before {
  content: ">";
  margin-right: 0.5rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.lang-switch:hover::before {
  opacity: 1;
}

.title {
  font-family: "Orbitron", monospace;
  font-size: 2.5rem;
  font-weight: 900;
  color: var(--text-primary);
  letter-spacing: 0.1em;
  margin-bottom: 0.5rem;
}

.title::before {
  content: ">";
  color: var(--accent-green);
  margin-right: 0.5rem;
  animation: cursor-pulse 2s ease-in-out infinite;
}

@keyframes cursor-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.subtitle {
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  position: relative;
  padding-left: 1rem;
}

.subtitle::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 0.5rem;
  height: 1px;
  background: var(--accent-green);
  transform: translateY(-50%);
}

.notif-status {
  font-size: 0.7rem;
  color: var(--text-secondary);
  font-family: "JetBrains Mono", monospace;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}

.notif-status.granted { color: var(--accent-green); cursor: default; }
.notif-status.denied { color: var(--danger); }
.notif-status.default:hover { color: var(--accent-green); }

.connection-status {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.connection-status.connected {
  color: var(--accent-green);
}

.connection-status.disconnected {
  color: var(--danger);
}
</style>
