<template>
  <router-view />

  <!-- 全局审批模态框 -->
  <ApprovalModal
    :current-approval="currentApproval"
    :current-texts="approvalTexts"
    @approve="handleApprovalDecision(true)"
    @deny="handleApprovalDecision(false)"
    @close="closeApprovalModal"
  />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useWebSocketStore } from './stores/websocket'
import ApprovalModal from './components/ApprovalModal.vue'

// 全局审批状态
const currentApproval = ref(null)
const wsStore = useWebSocketStore()

// 审批文本配置
const approvalTexts = {
  approve: 'APPROVE',
  deny: 'DENY',
  close: 'CLOSE'
}

// 处理全局审批请求
const handleGlobalApprovalRequest = (event) => {
  const data = event.detail
  console.log('🌐 全局审批请求:', data)

  currentApproval.value = {
    approvalId: data.approvalId || data.sessionId,
    sessionId: data.sessionId,
    command: data.command || data.payload?.command || "unknown",
    agent: data.agent || data.agentType || "Claude Code",
    risk: data.risk || "UNKNOWN",
    cwd: data.cwd || data.context?.cwd || "/unknown",
    reason: data.reason || data.description || `${data.risk || "UNKNOWN"} risk command`,
  }

  // 添加浏览器通知功能（只在用户没看着页面时才发送）
  const pageFocused = document.hasFocus()
  if ("Notification" in window && Notification.permission === "granted" && !pageFocused) {
    try {
      const notifTitle = '🛡️ Aegis 拦截请求，需要审批'
      const n = new Notification(notifTitle, {
        body: `[${data.risk || "UNKNOWN"}] ${data.command || "unknown command"}`,
        tag: data.approvalId || data.sessionId,
        requireInteraction: true,
      })
      n.onclick = () => {
        window.focus()
        n.close()
      }
      console.log("✅ 全局浏览器通知已发送")
    } catch (e) {
      console.error("❌ 全局浏览器通知发送失败:", e)
    }
  } else if ("Notification" in window && Notification.permission === "granted") {
    console.log("💡 页面处于焦点，跳过浏览器通知（显示模态框）")
  } else {
    console.warn("⚠️ 浏览器通知权限未开启:", Notification?.permission || "不支持")
  }
}

// 关闭审批模态框
const closeApprovalModal = () => {
  currentApproval.value = null
}

// 处理审批决定
const handleApprovalDecision = (approved) => {
  console.log(`🎯 handleApprovalDecision 被调用: ${approved ? "批准" : "拒绝"}`)

  if (!currentApproval.value) {
    console.error('❌ currentApproval.value 为空')
    return
  }

  const approvalId = currentApproval.value.approvalId
  const sessionId = currentApproval.value.sessionId
  console.log(`📝 全局审批决定: ${approvalId} - ${approved ? "批准" : "拒绝"}`)

  // 发送审批响应（包含approvalId）
  console.log('🔍 WebSocket状态检查:', wsStore.socket ? '已连接' : '未连接')
  console.log('🔍 wsStore对象:', wsStore)

  if (wsStore.socket) {
    console.log('📡 发送 approval_response 到 WebSocket')
    wsStore.socket.emit('approval_response', {
      approvalId: approvalId,
      sessionId: sessionId,
      approved: approved,
      reason: approved ? 'Approved by user' : '用户拒绝'
    })

    // 监听所有WebSocket事件进行调试
    wsStore.socket.onAny((eventName, data) => {
      console.log(`🔍 收到WebSocket事件: ${eventName}`, data)
    })

    // 监听处理结果，确认后关闭模态框
    const handleApprovalResult = (data) => {
      console.log(`📦 收到审批结果事件:`, data)
      if (data.approvalId === approvalId || data.data?.approvalId === approvalId) {
        console.log('✅ 审批处理完成，关闭模态框')
        closeApprovalModal()
        // 移除监听器
        wsStore.socket.off('approval_decision', handleApprovalResult)
        wsStore.socket.off('approval_resolved', handleApprovalResult)
      } else {
        console.log(`🔄 审批ID不匹配: 期望${approvalId}, 收到${data.approvalId || data.data?.approvalId}`)
      }
    }

    // 监听两种可能的响应事件
    wsStore.socket.on('approval_decision', handleApprovalResult)
    wsStore.socket.on('approval_resolved', handleApprovalResult)

    // 备用：3秒后自动关闭（防止卡住）
    setTimeout(() => {
      if (currentApproval.value?.approvalId === approvalId) {
        console.log('⏰ 审批响应超时，自动关闭模态框')
        closeApprovalModal()
      }
    }, 3000)
  } else {
    console.error('❌ WebSocket连接不存在，立即关闭模态框')
    // 没有WebSocket连接，立即关闭
    closeApprovalModal()
  }
}

// 监听全局审批事件
onMounted(() => {
  // 初始化WebSocket连接
  console.log('🔌 初始化WebSocket连接')
  wsStore.connect()

  window.addEventListener('global-approval-request', handleGlobalApprovalRequest)
})

onUnmounted(() => {
  window.removeEventListener('global-approval-request', handleGlobalApprovalRequest)
})
</script>

<style>
/* Element Plus CSS – needed for programmatic APIs (ElMessage) */
@import 'element-plus/dist/index.css';

:root {
  /* Map El vars → our dark terminal palette */
  --el-color-primary: #22c55e;
  --el-color-primary-light-3: rgba(34, 197, 94, 0.6);
  --el-color-primary-light-5: rgba(34, 197, 94, 0.4);
  --el-color-primary-light-7: rgba(34, 197, 94, 0.2);
  --el-color-primary-light-9: rgba(34, 197, 94, 0.08);
  --el-color-primary-dark-2: #16a34a;
  --el-bg-color: #0f172a;
  --el-bg-color-page: #0f172a;
  --el-bg-color-overlay: #1a2540;
  --el-fill-color-blank: rgba(255,255,255,0.03);
  --el-fill-color: rgba(255,255,255,0.05);
  --el-fill-color-light: rgba(255,255,255,0.04);
  --el-text-color-primary: #ffffff;
  --el-text-color-regular: rgba(255,255,255,0.7);
  --el-text-color-secondary: rgba(255,255,255,0.4);
  --el-text-color-placeholder: rgba(255,255,255,0.25);
  --el-border-color: rgba(255,255,255,0.1);
  --el-border-color-light: rgba(255,255,255,0.07);
  --el-border-color-lighter: rgba(255,255,255,0.05);
  --el-border-radius-base: 0px;
  --el-font-family: 'JetBrains Mono', monospace;
  --el-font-size-base: 0.8rem;
}

/* ElMessage – aegis style */
.el-message {
  background: #1a2540 !important;
  border: 1px solid rgba(255,255,255,0.12) !important;
  border-radius: 0 !important;
  font-family: 'JetBrains Mono', monospace !important;
  font-size: 0.75rem !important;
  letter-spacing: 0.05em;
  min-width: 280px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.6) !important;
}
.el-message--success { border-color: rgba(34, 197, 94, 0.4) !important; }
.el-message--success .el-message__content { color: #22c55e !important; }
.el-message--success .el-message__icon { color: #22c55e !important; }
.el-message--error { border-color: rgba(220, 38, 38, 0.4) !important; }
.el-message--error .el-message__content { color: #dc2626 !important; }
.el-message--error .el-message__icon { color: #dc2626 !important; }
.el-message--warning { border-color: rgba(245, 158, 11, 0.4) !important; }
.el-message--warning .el-message__content { color: #f59e0b !important; }
.el-message--warning .el-message__icon { color: #f59e0b !important; }
.el-message--info .el-message__content { color: rgba(255,255,255,0.7) !important; }

/* ElSelect – aegis style */
.aegis-select .el-input__wrapper {
  background: transparent !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  padding: 0 0.5rem !important;
  height: 2rem !important;
}
.aegis-select .el-input__wrapper:hover,
.aegis-select .el-input__wrapper.is-focus {
  border-color: rgba(34, 197, 94, 0.4) !important;
  box-shadow: none !important;
}
.aegis-select .el-input__inner {
  font-family: 'JetBrains Mono', monospace !important;
  font-size: 0.75rem !important;
  color: rgba(255,255,255,0.7) !important;
  height: 100% !important;
}
.aegis-select .el-select__suffix { color: rgba(255,255,255,0.3) !important; }
.el-select__popper {
  background: #1a2540 !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 0 !important;
  font-family: 'JetBrains Mono', monospace !important;
}
.el-select-dropdown__item {
  font-family: 'JetBrains Mono', monospace !important;
  font-size: 0.75rem !important;
  color: rgba(255,255,255,0.7) !important;
  padding: 0 1rem !important;
  height: 2rem !important;
  line-height: 2rem !important;
}
.el-select-dropdown__item:hover,
.el-select-dropdown__item.is-hovering { background: rgba(255,255,255,0.05) !important; }
.el-select-dropdown__item.is-selected,
.el-select-dropdown__item.selected { color: #22c55e !important; background: rgba(34,197,94,0.08) !important; }

/* ElMessageBox – aegis style */
.el-overlay-message-box { backdrop-filter: blur(2px); }
.el-message-box {
  background: #1a2540 !important;
  border: 1px solid rgba(255,255,255,0.12) !important;
  border-radius: 0 !important;
  font-family: 'JetBrains Mono', monospace !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7) !important;
}
.el-message-box__title { color: #ffffff !important; font-size: 0.85rem !important; letter-spacing: 0.08em; }
.el-message-box__content { color: rgba(255,255,255,0.7) !important; font-size: 0.78rem !important; }
.el-message-box__btns .el-button {
  font-family: 'JetBrains Mono', monospace !important;
  font-size: 0.72rem !important;
  border-radius: 0 !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.el-message-box__btns .el-button--primary {
  background: var(--danger) !important;
  border-color: var(--danger) !important;
}
.el-message-box__btns .el-button--default {
  background: transparent !important;
  border-color: rgba(255,255,255,0.15) !important;
  color: rgba(255,255,255,0.6) !important;
}
.el-message-box__headerbtn .el-message-box__close { color: rgba(255,255,255,0.4) !important; }
</style>

<style>
:root {
  --bg-primary: #0f172a;
  --bg-card: rgba(255, 255, 255, 0.02);
  --bg-hover: rgba(255, 255, 255, 0.04);
  --accent-green: #22c55e;
  --accent-green-dim: rgba(34, 197, 94, 0.1);
  --accent-green-border: rgba(34, 197, 94, 0.3);
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --text-muted: rgba(255, 255, 255, 0.4);
  --border: rgba(255, 255, 255, 0.08);
  --border-accent: rgba(34, 197, 94, 0.3);
  --danger: #dc2626;
  --warning: #f59e0b;
  --info: #3b82f6;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: "JetBrains Mono", monospace;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  padding: 2rem;
  height: 100vh;
  overflow: auto;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--accent-green); }
</style>
