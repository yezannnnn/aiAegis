<template>
  <AppHeader
    :ws-connected="wsConnected"
    :notif-permission="notifPermission"
    :current-texts="currentTexts"
    @toggle-language="toggleLanguage"
    @notif-click="handleNotifClick"
  />

  <StatsGrid
    :stats="stats"
    :current-texts="currentTexts"
    :active-filter="eventFilter"
    @filter-by-status="setEventFilter"
  />

  <AgentGrid
    :active-agents="activeAgents"
    :active-sessions="activeSessions"
    :current-texts="currentTexts"
  />

  <EventList
    :events="events"
    :filtered-events="filteredEvents"
    :event-filter="eventFilter"
    :time-filter="timeFilter"
    :is-loading-more="isLoadingMore"
    :has-more-events="hasMoreEvents"
    :ws-connected="wsConnected"
    :current-texts="currentTexts"
    @set-filter="setEventFilter"
    @set-time-filter="setTimeFilter"
    @scroll="onEventsScroll"
    @approve-event="approveEventInList"
    @deny-event="denyEventInList"
  />

  <!-- 状态指示器 -->
  <div class="status-bar">
    <div class="status-dot"></div>
    <span>{{ currentTexts.realTimeMonitoring }}</span>
  </div>

  <NotifModal
    :show-notif-modal="showNotifModal"
    :show-notif-guide="showNotifGuide"
    :current-texts="currentTexts"
    @grant="grantNotifPermission"
    @skip="skipNotifPermission"
    @close-guide="showNotifGuide = false"
    @test-notif="handleTestNotification"
  />

  <ApprovalModal
    :current-approval="currentApproval"
    :current-texts="currentTexts"
    @approve="handleApprovalDecision(true)"
    @deny="handleApprovalDecision(false)"
    @close="closeApprovalModal"
  />
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { io, Socket } from "socket.io-client";
import AppHeader from "./components/AppHeader.vue";
import StatsGrid from "./components/StatsGrid.vue";
import AgentGrid from "./components/AgentGrid.vue";
import EventList from "./components/EventList.vue";
import ApprovalModal from "./components/ApprovalModal.vue";
import NotifModal from "./components/NotifModal.vue";

// 语言配置
const languages = {
  zh: {
    title: "AEGIS",
    subtitle: "多代理安全监控",
    totalEvents: "总事件",
    commandsBlocked: "命令已阻止",
    commandsAllowed: "命令已允许",
    pendingReview: "待审查",
    timedOut: "审批超时",
    activeAgents: "[ 活跃代理 ]",
    activeSessions: "[ 活跃会话 ]",
    securityEvents: "[ 实时安全事件与代理上下文 ]",
    noActiveAgents: "暂无活跃代理",
    noActiveSessions: "暂无活跃会话",
    waitingForEvents: "等待拦截事件...",
    realTimeMonitoring: "实时监控",
    testSimulate: "测试模拟",
    connected: "已连接",
    disconnected: "已断开",
    connecting: "连接中...",
    connectedActive: "已连接 - 监控活跃",
    disconnectedCheck: "已断开 - 请检查服务",
    langSwitch: "EN",
    session: "会话",
    risk: "风险",
    events: "事件",
    firstSeen: "首次",
    lastActivity: "最后活动",
    total: "总计",
    blocked: "已阻止",
    allowed: "已允许",
    pending: "待审批",
    timed_out: "已超时",
    unknown: "未知",
    notifModalTitle: "启用浏览器通知",
    notifModalWhy: "为什么需要通知？",
    notifModalBody: "当 Aegis 拦截到危险命令时，即使您不在当前页面，也能立即收到警报并审批。",
    notifModalBodyTip: "💡 如果点击后没有反应，请检查地址栏附近的 🔒 图标，点击授权通知",
    notifSkip: "跳过",
    notifEnable: "开启通知",
    notifDeniedTitle: "通知权限被拒绝",
    notifDeniedBrowserLabel: "浏览器设置",
    notifDeniedChrome: "Chrome: 地址栏点击 🔒 → 网站设置 → 通知 → 允许",
    notifDeniedEdge: "Edge: 地址栏点击 🔒 → 权限 → 通知 → 允许",
    notifDeniedSafari: "Safari: 偏好设置 → 网站 → 通知 → 允许",
    notifDeniedMacLabel: "macOS 系统设置",
    notifDeniedMac: "系统设置 → 通知 → 浏览器 → 允许通知",
    notifDeniedRefresh: "修改后请刷新页面",
    notifDeniedBtn: "我知道了",
    notifTestBtn: "发送测试通知",
    executing: "执行中",
    intercepted: "已拦截",
  },
  en: {
    title: "AEGIS",
    subtitle: "Multi-Agent Security Monitor",
    totalEvents: "Total Events",
    commandsBlocked: "Commands Blocked",
    commandsAllowed: "Commands Allowed",
    pendingReview: "Pending Review",
    timedOut: "Timed Out",
    activeAgents: "[ Active Agents ]",
    activeSessions: "[ Active Sessions ]",
    securityEvents: "[ Real-time Security Events ]",
    noActiveAgents: "No active agents",
    noActiveSessions: "No active sessions",
    waitingForEvents: "Waiting for events...",
    realTimeMonitoring: "Real-time Monitoring",
    testSimulate: "Test Simulate",
    connected: "Connected",
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connectedActive: "Connected - Monitoring Active",
    disconnectedCheck: "Disconnected - Check Service",
    langSwitch: "中",
    session: "Session",
    risk: "Risk",
    events: "Events",
    firstSeen: "First Seen",
    lastActivity: "Last Activity",
    total: "Total",
    blocked: "Blocked",
    allowed: "Allowed",
    pending: "Pending",
    timed_out: "Timed Out",
    unknown: "Unknown",
    notifModalTitle: "Enable Browser Notifications",
    notifModalWhy: "Why notifications?",
    notifModalBody: "When Aegis intercepts a dangerous command, you'll get instant alerts even when not on this page.",
    notifModalBodyTip: "💡 If nothing happens after clicking, check the 🔒 icon near the address bar",
    notifSkip: "Skip",
    notifEnable: "Enable",
    notifDeniedTitle: "Notification Permission Denied",
    notifDeniedBrowserLabel: "Browser Settings",
    notifDeniedChrome: "Chrome: Click 🔒 in address bar → Site settings → Notifications → Allow",
    notifDeniedEdge: "Edge: Click 🔒 in address bar → Permissions → Notifications → Allow",
    notifDeniedSafari: "Safari: Preferences → Websites → Notifications → Allow",
    notifDeniedMacLabel: "macOS System Settings",
    notifDeniedMac: "System Settings → Notifications → Browser → Allow",
    notifDeniedRefresh: "Refresh page after changing",
    notifDeniedBtn: "Got it",
    notifTestBtn: "Send Test Notification",
    executing: "Executing",
    intercepted: "Intercepted",
  },
};

// 响应式数据
const currentLang = ref(localStorage.getItem("aegis-lang") || "zh");
const wsConnected = ref(false);
const socket = ref<Socket | null>(null);
const notifPermission = ref<NotificationPermission>(
  "Notification" in window ? Notification.permission : "denied"
);
const showNotifGuide = ref(false);
const showNotifModal = ref(false);
const notifSkipped = ref(sessionStorage.getItem("aegis-notif-skipped") === "true");

// 分页加载
const eventsOffset = ref(0);
const hasMoreEvents = ref(true);
const isLoadingMore = ref(false);

const loadEvents = async (reset = false) => {
  if (isLoadingMore.value) return;
  isLoadingMore.value = true;
  
  try {
    const params = new URLSearchParams();
    params.append('offset', String(reset ? 0 : eventsOffset.value));
    params.append('limit', '50');
    if (eventFilter.value !== 'all') {
      params.append('status', eventFilter.value);
    }
    if (timeFilter.value !== 'all') {
      params.append('timeFilter', timeFilter.value);
    }
    
    const res = await fetch(`/api/monitoring/events?${params.toString()}`);
    const json = await res.json();
    const newEvents = (json.data || []).map((event: any) => ({
      ...event,
      approvalId: event.approvalId,
      action: event.action || event.status,
      reason: event.description || event.reason,
      time: formatEventTime(new Date(event.timestamp)),
      isNew: false,
    }));
    
    if (reset) {
      events.value = newEvents;
      eventsOffset.value = 50;
    } else {
      const existingIds = new Set(events.value.map((e: any) => e.id));
      const deduped = newEvents.filter((e: any) => !existingIds.has(e.id));
      events.value = [...events.value, ...deduped];
      eventsOffset.value += 50;
    }
    
    if (newEvents.length < 50) hasMoreEvents.value = false;
    else hasMoreEvents.value = true;
  } finally {
    isLoadingMore.value = false;
  }
};

const loadMoreEvents = () => loadEvents(false);

const onEventsScroll = (e: Event) => {
  const el = e.target as HTMLElement;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
    loadMoreEvents();
  }
};

const grantNotifPermission = async () => {
  if (!("Notification" in window)) {
    showNotifModal.value = false;
    return;
  }
  
  if (Notification.permission === "denied") {
    showNotifModal.value = false;
    showNotifGuide.value = true;
    return;
  }
  
  try {
    const result = await Notification.requestPermission();
    notifPermission.value = result;
    showNotifModal.value = false;
    
    if (result === "granted") {
      const testNotif = new Notification("Aegis 通知已开启", {
        body: "现在可以在后台收到安全警报了",
        requireInteraction: false,
      });
      setTimeout(() => testNotif.close(), 3000);
    } else if (result === "denied") {
      showNotifGuide.value = true;
    }
  } catch (error) {
    showNotifGuide.value = true;
  }
};

const skipNotifPermission = () => {
  notifSkipped.value = true;
  sessionStorage.setItem("aegis-notif-skipped", "true");
  showNotifModal.value = false;
};

const handleNotifClick = async () => {
  if (!("Notification" in window)) return;
  
  if (Notification.permission === "granted") return;
  
  if (Notification.permission === "denied") {
    showNotifGuide.value = true;
    return;
  }
  
  showNotifModal.value = true;
};

const handleTestNotification = () => {
  if (!("Notification" in window)) {
    alert("此浏览器不支持桌面通知功能");
    return;
  }
  
  if (Notification.permission !== "granted") {
    showNotifModal.value = true;
    return;
  }
  
  try {
    const n = new Notification("Aegis 测试通知", {
      body: "如果你看到了这条消息，说明浏览器通知功能正常工作！",
      icon: "/favicon.ico",
      requireInteraction: true,
    });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 5000);
    alert("测试通知已发送！请检查屏幕角落或系统通知中心");
  } catch (e) {
    alert("测试通知发送失败，请检查浏览器设置");
  }
};

const stats = reactive({
  total: 0,
  blocked: 0,
  allowed: 0,
  pending: 0,
  timed_out: 0,
});

const activeAgents = ref([]);
const activeSessions = ref([]);
const events = ref([]);
const currentApproval = ref(null);
const eventFilter = ref('all');
const timeFilter = ref('all');

// 计算属性
const currentTexts = computed(() => languages[currentLang.value]);

// 筛选后的事件列表（现在只是展示用，实际数据从接口来）
const filteredEvents = computed(() => events.value);

// 格式化事件时间：当天只显示时间，非当天显示日期+时间
const formatEventTime = (date: Date): string => {
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) {
    return date.toLocaleTimeString();
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day} ${date.toLocaleTimeString()}`;
};

// 方法
const toggleLanguage = () => {
  currentLang.value = currentLang.value === "zh" ? "en" : "zh";
  localStorage.setItem("aegis-lang", currentLang.value);
  fetch("/api/monitoring/lang", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang: currentLang.value }),
  }).catch(() => {});
};

// 设置时间筛选
const setTimeFilter = (filter: string) => {
  timeFilter.value = filter;
  loadEvents(true);
};

// 设置事件筛选
const setEventFilter = (filter: string) => {
  eventFilter.value = filter;
  loadEvents(true);
};

const testSimulate = () => {
  fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
    .then((response) => response.json())
    .then((data) => {
      console.log(
        currentLang.value === "zh"
          ? "测试事件已生成:"
          : "Test event generated:",
        data
      );
    })
    .catch((error) => {
      console.error(
        currentLang.value === "zh" ? "测试失败:" : "Test failed:",
        error
      );
    });
};

const handleApprovalNotification = (data: any) => {
  if (!data.approvalId) {
    console.error("警告：审批请求缺少approvalId字段！", data);
  }
  
  // 只在用户没看着页面时才发系统通知
  const pageFocused = document.hasFocus();
  if (Notification.permission === "granted" && !pageFocused) {
    try {
      const notifTitle = currentLang.value === 'zh' ? 'Aegis 拦截请求，需要审批' : 'Aegis: Approval Required';
      const n = new Notification(notifTitle, {
        body: `[${data.risk || "UNKNOWN"}] ${data.command || "unknown command"}`,
        tag: data.approvalId,
        requireInteraction: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) {
      console.error("Browser notification failed:", e);
    }
  }
  
  currentApproval.value = {
    approvalId: data.approvalId,
    sessionId: data.sessionId || "unknown",
    command: data.command || data.payload?.command || "unknown",
    agent: data.agent || data.agentType || "Claude Code",
    risk: data.risk || "UNKNOWN",
    cwd: data.cwd || data.context?.cwd || "/unknown",
    reason: data.reason || data.description || `${data.risk || "UNKNOWN"} risk command`,
  };
  
  stats.pending += 1;
};

const closeApprovalModal = () => {
  currentApproval.value = null;
};

const handleApprovalDecision = async (approved: boolean) => {
  if (!currentApproval.value) return;
  
  const approvalId = currentApproval.value.approvalId;
  const sessionId = currentApproval.value.sessionId;
  
  if (!approvalId) {
    console.error('无法处理审批：缺少审批ID');
    return;
  }
  
  console.log(`弹窗审批决定: ${sessionId} - ${approved ? "批准" : "拒绝"}`);
  
  try {
    const response = await fetch(`/api/monitoring/approval-decision/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: approved ? "approve" : "deny",
        reason: approved ? "Approved by user" : "Denied by user",
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      currentApproval.value = null;
      stats.pending = Math.max(0, stats.pending - 1);
      if (approved) {
        stats.allowed += 1;
      } else {
        stats.blocked += 1;
      }
      
      const eventIndex = events.value.findIndex(e => e.approvalId === approvalId);
      if (eventIndex !== -1) {
        events.value[eventIndex].status = approved ? 'allowed' : 'blocked';
        events.value[eventIndex].action = approved ? 'allow' : 'deny';
      }
    } else {
      console.error("发送审批决定失败:", result.message);
    }
  } catch (error) {
    console.error("发送审批决定出错:", error);
  }
};

// 在事件列表中批准
const approveEventInList = async (event: any) => {
  if (!event.approvalId) {
    console.error('无法批准：缺少审批ID');
    return;
  }
  
  try {
    const response = await fetch(`/api/monitoring/approval-decision/${event.approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", reason: "Approved by user" }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      event.status = 'allowed';
      event.action = 'allow';
      stats.pending = Math.max(0, stats.pending - 1);
      stats.allowed += 1;
      
      if (currentApproval.value?.approvalId === event.approvalId) {
        currentApproval.value = null;
      }
    }
  } catch (error) {
    console.error("批准请求错误:", error);
  }
};

// 在事件列表中拒绝
const denyEventInList = async (event: any) => {
  if (!event.approvalId) {
    console.error('无法拒绝：缺少审批ID');
    return;
  }
  
  try {
    const response = await fetch(`/api/monitoring/approval-decision/${event.approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deny", reason: "Denied by user" }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      event.status = 'blocked';
      event.action = 'deny';
      stats.pending = Math.max(0, stats.pending - 1);
      stats.blocked += 1;
      
      if (currentApproval.value?.approvalId === event.approvalId) {
        currentApproval.value = null;
      }
    }
  } catch (error) {
    console.error("拒绝请求错误:", error);
  }
};

// WebSocket连接
const connectWebSocket = () => {
  const socketUrl = import.meta.env.VITE_API_URL ||
    (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001')
  socket.value = io(socketUrl);
  
  socket.value.on("connect", () => {
    console.log("WebSocket已连接");
    wsConnected.value = true;
  });
  
  socket.value.on("initial_state", (initialData: any) => {
    if (initialData.stats) {
      Object.assign(stats, initialData.stats);
    }
    if (initialData.agents) {
      activeAgents.value = initialData.agents;
    }
    if (initialData.sessions) {
      activeSessions.value = initialData.sessions;
    }
    if (initialData.events) {
      events.value = initialData.events.map((event: any) => ({
        ...event,
        approvalId: event.approvalId,
        action: event.action || event.status,
        reason: event.description || event.reason,
        time: formatEventTime(new Date(event.timestamp)),
        isNew: false,
      }));
    }
  });
  
  socket.value.on("disconnect", () => {
    console.log("WebSocket已断开");
    wsConnected.value = false;
  });
  
  socket.value.on("approval_request", handleApprovalNotification);
  socket.value.on("dual_approval_request", handleApprovalNotification);
  
  socket.value.on("approval_decision", (data: any) => {
    if (currentApproval.value?.approvalId === data.approvalId) {
      currentApproval.value = null;
    }
    
    const eventIndex = events.value.findIndex(e => e.approvalId === data.approvalId);
    if (eventIndex !== -1) {
      if (data.status === 'approved') {
        events.value[eventIndex].status = 'allowed';
        events.value[eventIndex].action = 'allow';
      } else if (data.status === 'timed_out') {
        events.value[eventIndex].status = 'timed_out';
        events.value[eventIndex].action = 'timed_out';
      } else {
        events.value[eventIndex].status = 'blocked';
        events.value[eventIndex].action = 'deny';
      }
      events.value[eventIndex].decidedBy = data.source || 'aegis_ui';
    }
    
    if (data.status === 'approved') {
      stats.allowed += 1;
    } else if (data.status === 'timed_out') {
      stats.timed_out += 1;
    } else {
      stats.blocked += 1;
    }
    stats.pending = Math.max(0, stats.pending - 1);
  });
  
  socket.value.on("claude_decision_sync", (data: any) => {
    if (currentApproval.value?.approvalId === data.approvalId) {
      currentApproval.value = null;
    }
    
    const eventIndex = events.value.findIndex(e => e.approvalId === data.approvalId);
    if (eventIndex !== -1) {
      events.value[eventIndex].status = data.decision === 'approved' ? 'allowed' : 'blocked';
      events.value[eventIndex].action = data.decision === 'approved' ? 'allow' : 'deny';
      events.value[eventIndex].reason = `${data.reason} (from Claude Code)`;
      events.value[eventIndex].decidedBy = 'claude_code';
    }
    
    if (data.decision === 'approved') {
      stats.allowed += 1;
    } else {
      stats.blocked += 1;
    }
    stats.pending = Math.max(0, stats.pending - 1);
  });
  
  socket.value.on("stats_update", (data: any) => {
    Object.assign(stats, data);
  });
  
  socket.value.on("agent_update", (response: any) => {
    const data = response.data || response;
    const agentIndex = activeAgents.value.findIndex(
      (a) => a.type === data.type && a.sessionId === data.sessionId
    );
    if (agentIndex >= 0) {
      activeAgents.value[agentIndex] = data;
    } else {
      activeAgents.value.push(data);
    }
  });
  
  socket.value.on("session_update", (response: any) => {
    const data = response.data || response;
    const sessionIndex = activeSessions.value.findIndex(
      (s) => s.id === data.id
    );
    if (sessionIndex >= 0) {
      activeSessions.value[sessionIndex] = data;
    } else {
      activeSessions.value.push(data);
    }
  });
  
  socket.value.on("new_event", (response: any) => {
    const data = response.data || response;
    const existingIdx = events.value.findIndex((e) => e.id === data.id);
    if (existingIdx >= 0) {
      const existing = events.value[existingIdx];
      existing.status = data.status;
      existing.action = data.action || data.status;
      existing.reason = data.description || data.reason || existing.reason;
      existing.risk = data.risk || existing.risk;
      if (data.userInput) existing.userInput = data.userInput;
      if (data.assistPrompt) existing.assistPrompt = data.assistPrompt;
      if (data.matchedRules) existing.matchedRules = data.matchedRules;
      if (data.taskId) existing.taskId = data.taskId;
    } else {
      events.value.unshift({
        id: data.id || Date.now(),
        approvalId: data.approvalId,
        command: data.command,
        agent: data.agent,
        sessionId: data.sessionId,
        risk: data.risk,
        cwd: data.cwd,
        taskId: data.taskId,
        userInput: data.userInput,
        assistPrompt: data.assistPrompt,
        matchedRules: data.matchedRules || [],
        reason: data.description || data.reason,
        time: formatEventTime(new Date(data.timestamp || Date.now())),
        action: data.action || data.status,
        status: data.status,
        isNew: true,
      });
      
      setTimeout(() => {
        const event = events.value.find((e) => e.id === data.id);
        if (event) event.isNew = false;
      }, 1000);
    }
    
    if (events.value.length > 200) {
      events.value = events.value.slice(0, 200);
    }
  });
};

// 生命周期
onMounted(() => {
  connectWebSocket();
  
  if ("Notification" in window && Notification.permission === "default" && !notifSkipped.value) {
    showNotifModal.value = true;
  }
});

onUnmounted(() => {
  if (socket.value) {
    socket.value.disconnect();
  }
});
</script>

<style>
:root {
  --bg-primary: #0f172a;
  --bg-card: rgba(255, 255, 255, 0.02);
  --accent-green: #22c55e;
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.7);
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

/* 状态指示器 */
.status-bar {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-dot {
  width: 6px;
  height: 6px;
  background: var(--accent-green);
  animation: status-pulse 2s ease-in-out infinite;
}

@keyframes status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>