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
    @skip="showNotifModal = false"
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
    sessionCount: "会话数",
    eventCount: "事件",
    allowed: "允许",
    blocked: "阻止",
    pending: "待审批",
    timed_out: "已超时",
    notifGranted: "🔔 通知已开启",
    notifDenied: "🔕 通知已关闭",
    notifDefault: "🔔 开启通知",
    notifModalTitle: "ENABLE NOTIFICATIONS",
    notifModalWhy: "WHY",
    notifModalBody: "拦截到危险命令时，即使页面在后台也能第一时间收到系统通知提醒你前来审批",
    notifSkip: "跳过",
    notifEnable: "开启通知",
    notifDeniedTitle: "⚠️ 需在浏览器设置中手动开启",
    notifDeniedChrome: "Chrome：地址栏左侧 🔒 → 通知 → 允许",
    notifDeniedSafari: "Safari：系统设置 → 通知 → 浏览器 → 开启",
    notifDeniedRefresh: "开启后刷新页面生效",
    notifDeniedBtn: "知道了",
    notifDeniedBrowserLabel: "浏览器设置",
    notifDeniedMacLabel: "macOS 系统设置",
    notifDeniedMac: "系统设置 → 通知 → Google Chrome → 允许通知",
    notifTestBtn: "发送测试通知",
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
    securityEvents: "[ Real-time Security Events & Agent Context ]",
    noActiveAgents: "No active agents",
    noActiveSessions: "No active sessions",
    waitingForEvents: "Waiting for intercept events...",
    realTimeMonitoring: "REAL-TIME MONITORING",
    testSimulate: "TEST SIMULATE",
    connected: "CONNECTED",
    disconnected: "DISCONNECTED",
    connecting: "CONNECTING...",
    connectedActive: "CONNECTED - MONITORING ACTIVE",
    disconnectedCheck: "DISCONNECTED - CHECK SERVICE",
    langSwitch: "中文",
    session: "Session",
    risk: "Risk",
    events: "Events",
    firstSeen: "First Seen",
    lastActivity: "Last Activity",
    sessionCount: "Sessions",
    eventCount: "Events",
    allowed: "Allowed",
    blocked: "Blocked",
    pending: "Pending",
    timed_out: "Timed Out",
    notifGranted: "🔔 Notifications On",
    notifDenied: "🔕 Notifications Off",
    notifDefault: "🔔 Enable Notifications",
    notifModalTitle: "ENABLE NOTIFICATIONS",
    notifModalWhy: "WHY",
    notifModalBody: "Get instantly notified when a risky command is intercepted, even when the page is in the background",
    notifSkip: "Skip",
    notifEnable: "Enable",
    notifDeniedTitle: "⚠️ Manual browser settings required",
    notifDeniedChrome: "Chrome: Click 🔒 in address bar → Notifications → Allow",
    notifDeniedSafari: "Safari: System Settings → Notifications → Browser → Enable",
    notifDeniedRefresh: "Refresh page after enabling",
    notifDeniedBtn: "Got it",
    notifDeniedBrowserLabel: "BROWSER SETTINGS",
    notifDeniedMacLabel: "MACOS SYSTEM SETTINGS",
    notifDeniedMac: "System Settings → Notifications → Google Chrome → Allow Notifications",
    notifTestBtn: "SEND TEST NOTIFICATION",
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

// 分页加载
const eventsOffset = ref(50);
const hasMoreEvents = ref(true);
const isLoadingMore = ref(false);

const loadMoreEvents = async () => {
  if (isLoadingMore.value || !hasMoreEvents.value) return;
  isLoadingMore.value = true;
  try {
    const res = await fetch(`/api/monitoring/events?offset=${eventsOffset.value}&limit=50`);
    const json = await res.json();
    const newEvents = (json.data || []).map((event: any) => ({
      ...event,
      approvalId: event.approvalId,
      action: event.action || event.status,
      reason: event.description || event.reason,
      time: formatEventTime(new Date(event.timestamp)),
      isNew: false,
    }));
    // 去重追加到末尾
    const existingIds = new Set(events.value.map((e: any) => e.id));
    const deduped = newEvents.filter((e: any) => !existingIds.has(e.id));
    events.value = [...events.value, ...deduped];
    eventsOffset.value += 50;
    if (deduped.length < 50) hasMoreEvents.value = false;
  } finally {
    isLoadingMore.value = false;
  }
};

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
  const result = await Notification.requestPermission();
  notifPermission.value = result;
  showNotifModal.value = false;
  if (result === "denied") showNotifGuide.value = true;
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
  if (Notification.permission !== "granted") {
    showNotifModal.value = true;
    return;
  }
  try {
    const n = new Notification("🧪 Aegis 测试通知", {
      body: "如果你能看到这条消息，说明浏览器通知配置正确！",
      requireInteraction: true,
    });
    n.onclick = () => { window.focus(); n.close(); };
    console.log("✅ 测试通知已发送，检查系统通知中心");
  } catch (e) {
    console.error("❌ 测试通知发送失败:", e);
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

// 筛选后的事件列表（状态 + 时间双重过滤）
const filteredEvents = computed(() => {
  let result = events.value;

  // 时间过滤
  if (timeFilter.value !== 'all') {
    const now = Date.now();
    const cutoff = {
      '1h':   now - 60 * 60 * 1000,
      '24h':  now - 24 * 60 * 60 * 1000,
      'today': new Date().setHours(0, 0, 0, 0),
    }[timeFilter.value] ?? 0;
    result = result.filter(e => new Date(e.timestamp || e.time).getTime() >= cutoff);
  }

  // 状态过滤
  if (eventFilter.value !== 'all') {
    result = result.filter(e => e.status === eventFilter.value);
  }

  return result;
});

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
};

// 设置时间筛选
const setTimeFilter = (filter: string) => {
  timeFilter.value = filter;
};

// 设置事件筛选
const setEventFilter = (filter: string) => {
  eventFilter.value = filter;
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
  console.log("🔔 收到审批请求:", data);
  console.log("🔍 审批ID:", data.approvalId);

  if (!data.approvalId) {
    console.error("❌ 警告：审批请求缺少approvalId字段！", data);
  }

  // 只在用户没看着页面时才发系统通知（避免被 macOS/Chrome 静默吞掉）
  const pageFocused = document.hasFocus();
  if (Notification.permission === "granted" && !pageFocused) {
    try {
      const n = new Notification("🛡️ Aegis 拦截请求，需要审批", {
        body: `[${data.risk || "UNKNOWN"}] ${data.command || "unknown command"}`,
        tag: data.approvalId,
        requireInteraction: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
      console.log("✅ 浏览器通知已发送 (页面无焦点)");
    } catch (e) {
      console.error("❌ 浏览器通知发送失败:", e);
    }
  } else if (Notification.permission === "granted") {
    console.log("💡 页面有焦点，跳过系统通知（页内弹窗已显示）");
  } else {
    console.warn("⚠️ 通知权限未授予，当前状态:", Notification.permission);
  }

  currentApproval.value = {
    approvalId: data.approvalId,
    sessionId: data.sessionId || "unknown",
    command: data.command || data.payload?.command || "unknown",
    agent: data.agent || data.agentType || "Claude Code",
    risk: data.risk || "UNKNOWN",
    cwd: data.cwd || data.context?.cwd || "/unknown",
    reason: data.reason || data.description || `${data.risk || "UNKNOWN"} 风险命令`,
  };

  // 更新待审批统计（事件本身由 new_event 统一处理）
  stats.pending += 1;

  console.log("💾 当前审批对象:", currentApproval.value);
};

const closeApprovalModal = () => {
  currentApproval.value = null;
};

const handleApprovalDecision = async (approved: boolean) => {
  if (!currentApproval.value) return;

  const approvalId = currentApproval.value.approvalId;
  const sessionId = currentApproval.value.sessionId;

  if (!approvalId) {
    console.error('❌ 无法处理审批：缺少审批ID');
    return;
  }

  console.log(`📝 弹窗审批决定: ${sessionId} - ${approved ? "批准" : "拒绝"}`);

  try {
    // 发送审批决定到新的API
    const response = await fetch(`/api/monitoring/approval-decision/${approvalId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: approved ? "approve" : "deny",
        reason: approved ? "用户在弹窗中批准" : "用户在弹窗中拒绝",
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log("✅ 弹窗审批决定已发送:", result);

      // 关闭模态框
      currentApproval.value = null;

      // 更新统计
      stats.pending = Math.max(0, stats.pending - 1);
      if (approved) {
        stats.allowed += 1;
      } else {
        stats.blocked += 1;
      }

      // 更新事件列表中对应的事件状态
      const eventIndex = events.value.findIndex(e => e.approvalId === approvalId);
      if (eventIndex !== -1) {
        events.value[eventIndex].status = approved ? 'allowed' : 'blocked';
        events.value[eventIndex].action = approved ? 'allow' : 'deny';
      }
    } else {
      console.error("❌ 发送审批决定失败:", result.message);
    }
  } catch (error) {
    console.error("❌ 发送审批决定出错:", error);
  }
};

// 在事件列表中批准
const approveEventInList = async (event: any) => {
  console.log(`📝 列表审批 - 批准:`, event);

  if (!event.approvalId) {
    console.error('❌ 无法批准：缺少审批ID');
    return;
  }

  try {
    // 发送审批决定到新的API
    const response = await fetch(`/api/monitoring/approval-decision/${event.approvalId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "approve",
        reason: "用户在列表中批准",
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`✅ 批准成功:`, result);

      // 更新事件状态
      event.status = 'allowed';
      event.action = 'allow';

      // 更新统计
      stats.pending = Math.max(0, stats.pending - 1);
      stats.allowed += 1;

      // 如果这是当前弹窗显示的事件，关闭弹窗
      if (currentApproval.value?.approvalId === event.approvalId) {
        currentApproval.value = null;
      }
    } else {
      console.error('❌ 批准失败:', result.message);
    }
  } catch (error) {
    console.error('❌ 批准请求错误:', error);
  }
};

// 在事件列表中拒绝
const denyEventInList = async (event: any) => {
  console.log(`📝 列表审批 - 拒绝:`, event);

  if (!event.approvalId) {
    console.error('❌ 无法拒绝：缺少审批ID');
    return;
  }

  try {
    // 发送审批决定到新的API
    const response = await fetch(`/api/monitoring/approval-decision/${event.approvalId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "deny",
        reason: "用户在列表中拒绝",
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`✅ 拒绝成功:`, result);

      // 更新事件状态
      event.status = 'blocked';
      event.action = 'deny';

      // 更新统计
      stats.pending = Math.max(0, stats.pending - 1);
      stats.blocked += 1;

      // 如果这是当前弹窗显示的事件，关闭弹窗
      if (currentApproval.value?.approvalId === event.approvalId) {
        currentApproval.value = null;
      }
    } else {
      console.error('❌ 拒绝失败:', result.message);
    }
  } catch (error) {
    console.error('❌ 拒绝请求错误:', error);
  }
};

// WebSocket连接
const connectWebSocket = () => {
  const socketUrl = import.meta.env.VITE_API_URL ||
    (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001')
  socket.value = io(socketUrl);

  socket.value.on("connect", () => {
    console.log("✅ WebSocket已连接");
    wsConnected.value = true;
  });

  // 🔔 监听初始状态
  socket.value.on("initial_state", (initialData: any) => {
    console.log("📊 收到初始状态:", initialData);

    // 更新统计数据
    if (initialData.stats) {
      Object.assign(stats, initialData.stats);
    }

    // 更新代理数据
    if (initialData.agents) {
      activeAgents.value = initialData.agents;
    }

    // 更新会话数据
    if (initialData.sessions) {
      activeSessions.value = initialData.sessions;
    }

    // 更新事件数据
    if (initialData.events) {
      events.value = initialData.events.map((event) => ({
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
    console.log("❌ WebSocket已断开");
    wsConnected.value = false;
  });

  // 监听审批通知
  socket.value.on("approval_request", handleApprovalNotification);
  socket.value.on("dual_approval_request", handleApprovalNotification);

  // 监听审批决定结果
  socket.value.on("approval_decision", (data: any) => {
    console.log("🎯 收到审批决定结果:", data);

    // 如果当前弹窗显示的是这个审批，关闭弹窗
    if (currentApproval.value?.approvalId === data.approvalId) {
      currentApproval.value = null;
      console.log("📴 关闭当前审批弹窗");
    }

    // 更新事件列表中的对应事件
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
      console.log(`📝 更新事件列表状态: ${data.approvalId} -> ${events.value[eventIndex].status} (来源: ${events.value[eventIndex].decidedBy})`);
    }

    // 更新统计
    if (data.status === 'approved') {
      stats.allowed += 1;
    } else if (data.status === 'timed_out') {
      stats.timed_out += 1;
    } else {
      stats.blocked += 1;
    }
    stats.pending = Math.max(0, stats.pending - 1);

    console.log("📊 统计更新完成:", stats);
  });

  // 🔄 监听Claude Code决策同步（双向同步新增）
  socket.value.on("claude_decision_sync", (data: any) => {
    console.log("🔄 收到Claude Code决策同步:", data);

    // 如果当前弹窗显示的是这个审批，关闭弹窗并显示同步消息
    if (currentApproval.value?.approvalId === data.approvalId) {
      currentApproval.value = null;
      console.log("📴 Claude Code已决策，关闭3001审批弹窗");
    }

    // 更新事件列表中的对应事件
    const eventIndex = events.value.findIndex(e => e.approvalId === data.approvalId);
    if (eventIndex !== -1) {
      events.value[eventIndex].status = data.decision === 'approved' ? 'allowed' : 'blocked';
      events.value[eventIndex].action = data.decision === 'approved' ? 'allow' : 'deny';
      events.value[eventIndex].reason = `${data.reason} (来自Claude Code)`;
      events.value[eventIndex].decidedBy = 'claude_code';
      console.log(`🔄 Claude Code同步更新: ${data.approvalId} -> ${events.value[eventIndex].status}`);
    }

    // 更新统计
    if (data.decision === 'approved') {
      stats.allowed += 1;
    } else {
      stats.blocked += 1;
    }
    stats.pending = Math.max(0, stats.pending - 1);

    // 显示同步通知
    console.log("🔄 Claude Code决策已同步到3001界面");
  });

  // 监听统计更新
  socket.value.on("stats_update", (data: any) => {
    Object.assign(stats, data);
  });

  // 🔔 监听代理更新
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

  // 🔔 监听会话更新
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

  // 监听事件更新
  socket.value.on("new_event", (response: any) => {
    const data = response.data || response;
    console.log("📝 收到新事件:", data);

    // 按 id 去重：已存在则原地更新，否则新增
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
      console.log("🔄 更新已有事件:", data.id, "→", data.status);
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

      // 移除new标记
      setTimeout(() => {
        const event = events.value.find((e) => e.id === data.id);
        if (event) event.isNew = false;
      }, 1000);
    }

    // 限制事件数量
    if (events.value.length > 100) {
      events.value = events.value.slice(0, 100);
    }
  });
};

// 生命周期
onMounted(() => {
  connectWebSocket();
  if ("Notification" in window && Notification.permission === "default") {
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
  /* 暗夜线条简约配色 */
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
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

</style>
