#!/usr/bin/env node
/**
 * Aegis Enhanced Security Monitor - 现代化安全监控界面
 * 特点：更加现代的UI设计、实时图表、更好的交互体验
 */

const http = require('http');
const net = require('net');

const WEB_PORT = 3001;
const AEGIS_HOST = '127.0.0.1';
const AEGIS_PORT = 9876;

// 存储数据
let events = [];
let connections = [];
let stats = { blocked: 0, allowed: 0, warning: 0, info: 0, total: 0 };
let pendingRequests = new Map();
let hourlyStats = Array(24).fill(0).map((_, hour) => ({ hour, blocked: 0, allowed: 0 }));

// 添加事件
function addEvent(type, message, command = '', agent = 'Claude Code', requestId = null) {
  const event = {
    id: Date.now() + Math.random(),
    type,
    message,
    command,
    agent,
    requestId,
    timestamp: new Date().toLocaleString('zh-CN'),
    time: Date.now()
  };

  events.unshift(event);
  if (events.length > 1000) events.pop();

  stats[type] = (stats[type] || 0) + 1;
  stats.total++;

  // 更新小时统计
  const hour = new Date().getHours();
  if (hourlyStats[hour]) {
    hourlyStats[hour][type === 'blocked' ? 'blocked' : 'allowed']++;
  }

  broadcastEvent(event);
}

// 广播事件到所有连接的客户端
function broadcastEvent(event) {
  connections.forEach((ws, index) => {
    try {
      ws.write(`data: ${JSON.stringify({ type: 'event', data: event })}\n\n`);
    } catch (e) {
      connections.splice(index, 1);
    }
  });
}

// 广播决策请求
function broadcastDecisionRequest(request) {
  connections.forEach((ws, index) => {
    try {
      ws.write(`data: ${JSON.stringify({ type: 'decision_request', data: request })}\n\n`);
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

  console.log(`\n⚠️ 交互式拦截: ${command}`);
  console.log(`🎯 Agent: ${agent}, Risk: ${riskLevel}`);
  console.log(`💡 等待Web界面用户决策...`);

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
      message = `✅ 用户允许执行: ${request.command}`;
      break;
    case 'session':
      eventType = 'allowed';
      message = `🔓 会话允许: ${request.command} (本次会话有效)`;
      break;
    case 'deny':
    default:
      eventType = 'blocked';
      message = `🛡️ 用户拒绝执行: ${request.command}`;
      break;
  }

  addEvent(eventType, message, request.command, request.agent, requestId);

  broadcastEvent({
    type: 'decision_result',
    requestId,
    decision,
    reason,
    timestamp: new Date().toLocaleString('zh-CN')
  });

  console.log(`\n🛡️ [${new Date().toLocaleString()}] ${eventType.toUpperCase()}: ${message}`);
}

// 计算风险等级
function calculateRiskLevel(command) {
  const criticalPatterns = [
    /rm\s+.*-rf?\s+\//,
    /sudo.*rm.*-rf/,
    /dd\s+if=/,
    />.*\/dev\//
  ];

  const highRiskPatterns = [
    /git\s+push.*--force/,
    /git\s+reset.*--hard/,
    /chmod\s+777/,
    /curl.*\|\s*sudo/,
    /wget.*\|\s*sh/
  ];

  const mediumRiskPatterns = [
    /git\s+clean\s+.*-f/,
    /npm\s+install.*--unsafe/,
    /curl.*\|\s*sh/,
    /sudo/
  ];

  for (const pattern of criticalPatterns) {
    if (pattern.test(command)) return 'CRITICAL';
  }

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
    CRITICAL: '⚠️ 极度危险！建议立即拒绝，此命令可能导致系统完全损坏。',
    HIGH: '🚨 高度危险！建议拒绝，除非您完全确定操作的后果。',
    MEDIUM: '⚠️ 中等风险，请仔细确认命令的必要性。',
    LOW: '✓ 风险较低，但请确认命令正确性。'
  };
  return suggestions[riskLevel] || suggestions.LOW;
}

// 生成替代方案
function generateAlternatives(command) {
  if (command.includes('rm -rf')) {
    return ['使用 rm -i 进行交互式删除', '先备份重要文件', '使用 ls 确认路径正确'];
  }
  if (command.includes('git push --force')) {
    return ['使用 git push --force-with-lease', '先与团队确认', '检查要覆盖的提交'];
  }
  if (command.includes('chmod 777')) {
    return ['使用更具体的权限 (644/755)', '只为特定用户组设置权限', '检查文件实际需要的权限'];
  }
  return ['仔细检查命令参数', '查阅相关文档', '在测试环境先试验'];
}

// 生成现代化HTML页面
function getHTML() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🛡️ Aegis Enhanced Security Monitor</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --primary: #0F172A;
            --secondary: #1E293B;
            --tertiary: #334155;
            --accent: #3B82F6;
            --accent-hover: #2563EB;
            --success: #10B981;
            --warning: #F59E0B;
            --danger: #EF4444;
            --info: #06B6D4;
            --text-primary: #F8FAFC;
            --text-secondary: #CBD5E1;
            --text-muted: #64748B;
            --border: #475569;
            --border-light: #64748B;
            --shadow: rgba(0, 0, 0, 0.25);
            --glow: rgba(59, 130, 246, 0.2);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, var(--primary) 0%, #0A1628 100%);
            color: var(--text-primary);
            min-height: 100vh;
            line-height: 1.6;
            overflow-x: hidden;
        }

        /* 动态背景 */
        .bg-pattern {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0.03;
            background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Ccircle cx='9' cy='9' r='1'/%3E%3Cpath d='m19 19 2-2v-2h-2v2l-2 2v2h2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
            pointer-events: none;
            z-index: -1;
        }

        /* 主容器 */
        .container {
            max-width: 1600px;
            margin: 0 auto;
            padding: 20px;
        }

        /* 顶部状态栏 */
        .status-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(30, 41, 59, 0.8);
            backdrop-filter: blur(10px);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 16px 24px;
            margin-bottom: 24px;
            position: sticky;
            top: 20px;
            z-index: 100;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 24px;
            font-weight: 800;
        }

        .logo-icon {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, var(--accent), var(--info));
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
        }

        .system-status {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid var(--success);
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
        }

        .pulse {
            width: 8px;
            height: 8px;
            background: var(--success);
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
        }

        /* 统计卡片网格 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 32px;
        }

        .stat-card {
            background: rgba(30, 41, 59, 0.6);
            backdrop-filter: blur(10px);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-2px);
            border-color: var(--accent);
            box-shadow: 0 8px 32px var(--glow);
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--card-color);
        }

        .stat-card.blocked { --card-color: var(--danger); }
        .stat-card.allowed { --card-color: var(--success); }
        .stat-card.warning { --card-color: var(--warning); }
        .stat-card.pending { --card-color: var(--info); }

        .stat-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .stat-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(var(--card-color-rgb), 0.1);
            font-size: 20px;
        }

        .stat-value {
            font-size: 36px;
            font-weight: 800;
            margin-bottom: 4px;
        }

        .stat-label {
            color: var(--text-secondary);
            font-size: 14px;
            font-weight: 500;
        }

        .stat-trend {
            font-size: 12px;
            color: var(--success);
            margin-top: 8px;
        }

        /* 主要内容区域 */
        .main-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 24px;
            margin-bottom: 32px;
        }

        .content-card {
            background: rgba(30, 41, 59, 0.6);
            backdrop-filter: blur(10px);
            border: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
        }

        .card-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .card-title {
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        /* 事件列表 */
        .events-list {
            max-height: 600px;
            overflow-y: auto;
        }

        .event-item {
            padding: 16px 24px;
            border-bottom: 1px solid var(--border);
            transition: background 0.2s ease;
        }

        .event-item:hover {
            background: rgba(51, 65, 85, 0.3);
        }

        .event-item:last-child {
            border-bottom: none;
        }

        .event-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .event-badge {
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .event-blocked .event-badge { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
        .event-allowed .event-badge { background: rgba(16, 185, 129, 0.2); color: var(--success); }
        .event-warning .event-badge { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
        .event-info .event-badge { background: rgba(6, 182, 212, 0.2); color: var(--info); }

        .event-time {
            font-size: 11px;
            color: var(--text-muted);
            font-family: 'JetBrains Mono', monospace;
        }

        .event-message {
            font-size: 14px;
            margin-bottom: 4px;
        }

        .event-command {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            background: rgba(0, 0, 0, 0.3);
            padding: 8px 12px;
            border-radius: 6px;
            color: var(--text-secondary);
            word-break: break-all;
        }

        /* 决策面板 */
        .decisions-list {
            padding: 16px;
        }

        .decision-item {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid var(--danger);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
        }

        .decision-header {
            display: flex;
            justify-content: between;
            align-items: center;
            margin-bottom: 16px;
        }

        .risk-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .risk-critical { background: var(--danger); color: white; }
        .risk-high { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
        .risk-medium { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
        .risk-low { background: rgba(16, 185, 129, 0.2); color: var(--success); }

        .decision-timer {
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            color: var(--warning);
        }

        .decision-command {
            font-family: 'JetBrains Mono', monospace;
            background: rgba(0, 0, 0, 0.4);
            padding: 12px;
            border-radius: 8px;
            margin: 12px 0;
            font-size: 14px;
        }

        .decision-buttons {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 16px;
        }

        .decision-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .btn-allow { background: var(--success); color: white; }
        .btn-deny { background: var(--danger); color: white; }
        .btn-session { background: var(--warning); color: white; }
        .btn-info { background: var(--info); color: white; }

        .decision-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        /* 图表区域 */
        .chart-container {
            padding: 24px;
            height: 400px;
        }

        /* 响应式设计 */
        @media (max-width: 1200px) {
            .main-grid {
                grid-template-columns: 1fr;
            }

            .stats-grid {
                grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            }
        }

        @media (max-width: 768px) {
            .container {
                padding: 12px;
            }

            .status-bar {
                flex-direction: column;
                gap: 16px;
                text-align: center;
            }

            .stats-grid {
                grid-template-columns: 1fr;
            }
        }

        /* 滚动条样式 */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: var(--secondary);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--border);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--border-light);
        }

        /* 空状态 */
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--text-muted);
        }

        .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="bg-pattern"></div>

    <div class="container">
        <!-- 状态栏 -->
        <div class="status-bar">
            <div class="logo">
                <div class="logo-icon">🛡️</div>
                <div>
                    <div>Aegis Enhanced</div>
                    <div style="font-size: 12px; color: var(--text-secondary); font-weight: 400;">Security Monitor v2.0</div>
                </div>
            </div>
            <div class="system-status">
                <div class="status-indicator">
                    <div class="pulse"></div>
                    <span id="connectionStatus">系统运行中</span>
                </div>
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted);">
                    <span id="currentTime"></span>
                </div>
            </div>
        </div>

        <!-- 统计卡片 -->
        <div class="stats-grid">
            <div class="stat-card blocked">
                <div class="stat-header">
                    <div class="stat-icon" style="--card-color-rgb: 239, 68, 68;">🚫</div>
                </div>
                <div class="stat-value" id="blockedCount">0</div>
                <div class="stat-label">已拦截命令</div>
                <div class="stat-trend">↑ 安全防护生效</div>
            </div>

            <div class="stat-card allowed">
                <div class="stat-header">
                    <div class="stat-icon" style="--card-color-rgb: 16, 185, 129;">✅</div>
                </div>
                <div class="stat-value" id="allowedCount">0</div>
                <div class="stat-label">已允许命令</div>
                <div class="stat-trend">→ 正常操作</div>
            </div>

            <div class="stat-card pending">
                <div class="stat-header">
                    <div class="stat-icon" style="--card-color-rgb: 6, 182, 212;">⏳</div>
                </div>
                <div class="stat-value" id="pendingCount">0</div>
                <div class="stat-label">待决策</div>
                <div class="stat-trend" id="pendingTrend">⚡ 实时监控</div>
            </div>

            <div class="stat-card warning">
                <div class="stat-header">
                    <div class="stat-icon" style="--card-color-rgb: 245, 158, 11;">📊</div>
                </div>
                <div class="stat-value" id="totalCount">0</div>
                <div class="stat-label">总计事件</div>
                <div class="stat-trend">📈 实时统计</div>
            </div>
        </div>

        <!-- 主要内容区域 -->
        <div class="main-grid">
            <!-- 事件监控 -->
            <div class="content-card">
                <div class="card-header">
                    <h3 class="card-title">
                        📋 实时事件监控
                    </h3>
                    <button onclick="clearEvents()" class="decision-btn btn-info" style="font-size: 11px;">清空历史</button>
                </div>
                <div class="events-list" id="eventsList">
                    <div class="empty-state">
                        <div class="empty-icon">🔍</div>
                        <div>等待安全事件...</div>
                        <div style="font-size: 12px; margin-top: 8px;">系统正在监控危险命令</div>
                    </div>
                </div>
            </div>

            <!-- 决策面板 -->
            <div class="content-card">
                <div class="card-header">
                    <h3 class="card-title">
                        ⚠️ 安全决策
                    </h3>
                </div>
                <div class="decisions-list" id="decisionsList">
                    <div class="empty-state">
                        <div class="empty-icon">🛡️</div>
                        <div>暂无待决策事件</div>
                        <div style="font-size: 12px; margin-top: 8px;">危险命令将在此显示</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 活动图表 -->
        <div class="content-card">
            <div class="card-header">
                <h3 class="card-title">
                    📈 24小时活动统计
                </h3>
            </div>
            <div class="chart-container">
                <canvas id="activityChart"></canvas>
            </div>
        </div>
    </div>

    <script>
        let eventSource;
        let chart;
        let hourlyData = Array(24).fill(0).map((_, hour) => ({ hour, blocked: 0, allowed: 0 }));

        // 初始化
        document.addEventListener('DOMContentLoaded', function() {
            initializeEventSource();
            initializeChart();
            updateTime();
            setInterval(updateTime, 1000);

            // 键盘快捷键
            document.addEventListener('keydown', function(e) {
                if (e.target.tagName === 'INPUT') return;

                switch(e.key.toLowerCase()) {
                    case 'a':
                        handleGlobalDecision('allow');
                        break;
                    case 'd':
                        handleGlobalDecision('deny');
                        break;
                    case 's':
                        handleGlobalDecision('session');
                        break;
                }
            });
        });

        // 连接事件源
        function initializeEventSource() {
            eventSource = new EventSource('/events');

            eventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);

                switch(data.type) {
                    case 'event':
                        addEventToList(data.data);
                        updateStats();
                        break;
                    case 'decision_request':
                        addDecisionRequest(data.data);
                        updateStats();
                        break;
                    case 'decision_result':
                        removeDecisionRequest(data.data.requestId);
                        break;
                }
            };

            eventSource.onerror = function() {
                document.getElementById('connectionStatus').textContent = '连接断开';
                setTimeout(() => {
                    if (eventSource.readyState === EventSource.CLOSED) {
                        initializeEventSource();
                    }
                }, 5000);
            };

            eventSource.onopen = function() {
                document.getElementById('connectionStatus').textContent = '系统运行中';
            };
        }

        // 初始化图表
        function initializeChart() {
            const ctx = document.getElementById('activityChart').getContext('2d');

            chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: Array.from({length: 24}, (_, i) => \`\${i}:00\`),
                    datasets: [{
                        label: '已拦截',
                        data: hourlyData.map(d => d.blocked),
                        borderColor: '#EF4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.4
                    }, {
                        label: '已允许',
                        data: hourlyData.map(d => d.allowed),
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#CBD5E1'
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(71, 85, 105, 0.3)' },
                            ticks: { color: '#64748B' }
                        },
                        y: {
                            grid: { color: 'rgba(71, 85, 105, 0.3)' },
                            ticks: { color: '#64748B' }
                        }
                    },
                    elements: {
                        point: {
                            radius: 4,
                            hoverRadius: 6
                        }
                    }
                }
            });
        }

        // 更新时间
        function updateTime() {
            const now = new Date();
            const timeString = now.toLocaleTimeString('zh-CN', { hour12: false });
            document.getElementById('currentTime').textContent = timeString;
        }

        // 添加事件到列表
        function addEventToList(event) {
            const eventsList = document.getElementById('eventsList');
            const emptyState = eventsList.querySelector('.empty-state');
            if (emptyState) emptyState.remove();

            const eventItem = document.createElement('div');
            eventItem.className = \`event-item event-\${event.type}\`;
            eventItem.innerHTML = \`
                <div class="event-header">
                    <span class="event-badge">\${event.type}</span>
                    <span class="event-time">\${event.timestamp}</span>
                    <span style="margin-left: auto; font-size: 11px; color: var(--text-muted);">\${event.agent}</span>
                </div>
                <div class="event-message">\${event.message}</div>
                \${event.command ? \`<div class="event-command">\${event.command}</div>\` : ''}
            \`;

            eventsList.insertBefore(eventItem, eventsList.firstChild);

            // 限制显示数量
            const items = eventsList.querySelectorAll('.event-item');
            if (items.length > 100) {
                items[items.length - 1].remove();
            }

            // 更新图表数据
            const hour = new Date().getHours();
            if (event.type === 'blocked') {
                hourlyData[hour].blocked++;
            } else if (event.type === 'allowed') {
                hourlyData[hour].allowed++;
            }
            updateChart();
        }

        // 添加决策请求
        function addDecisionRequest(request) {
            const decisionsList = document.getElementById('decisionsList');
            const emptyState = decisionsList.querySelector('.empty-state');
            if (emptyState) emptyState.remove();

            const decisionItem = document.createElement('div');
            decisionItem.className = 'decision-item';
            decisionItem.id = \`decision-\${request.requestId}\`;

            let timerInterval;
            let timeLeft = 30;

            decisionItem.innerHTML = \`
                <div class="decision-header">
                    <span class="risk-badge risk-\${request.riskLevel.toLowerCase()}">\${request.riskLevel} 风险</span>
                    <span class="decision-timer" id="timer-\${request.requestId}">⏰ \${timeLeft}s</span>
                </div>
                <div style="margin: 8px 0;">
                    <strong>Agent:</strong> \${request.agent} | <strong>时间:</strong> \${request.timestamp}
                </div>
                <div class="decision-command">\${request.command}</div>
                <div style="font-size: 13px; margin: 8px 0; color: var(--text-secondary);">
                    \${request.suggestion}
                </div>
                <div class="decision-buttons">
                    <button class="decision-btn btn-allow" onclick="makeDecision('\${request.requestId}', 'allow')">
                        ✅ 允许 (A)
                    </button>
                    <button class="decision-btn btn-deny" onclick="makeDecision('\${request.requestId}', 'deny')">
                        🚫 拒绝 (D)
                    </button>
                    <button class="decision-btn btn-session" onclick="makeDecision('\${request.requestId}', 'session')">
                        🔓 会话允许 (S)
                    </button>
                    <button class="decision-btn btn-info" onclick="showDetails('\${request.requestId}')">
                        ℹ️ 详情 (I)
                    </button>
                </div>
            \`;

            decisionsList.insertBefore(decisionItem, decisionsList.firstChild);

            // 倒计时
            timerInterval = setInterval(() => {
                timeLeft--;
                const timerElement = document.getElementById(\`timer-\${request.requestId}\`);
                if (timerElement) {
                    timerElement.textContent = \`⏰ \${timeLeft}s\`;
                    if (timeLeft <= 10) {
                        timerElement.style.color = 'var(--danger)';
                        timerElement.style.fontWeight = 'bold';
                    }
                }

                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                }
            }, 1000);
        }

        // 移除决策请求
        function removeDecisionRequest(requestId) {
            const decisionItem = document.getElementById(\`decision-\${requestId}\`);
            if (decisionItem) {
                decisionItem.style.transition = 'all 0.3s ease';
                decisionItem.style.opacity = '0';
                decisionItem.style.transform = 'translateX(-100%)';
                setTimeout(() => decisionItem.remove(), 300);
            }
            updatePendingCount();
        }

        // 做决策
        function makeDecision(requestId, decision) {
            fetch('/decision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, decision })
            });
        }

        // 全局决策快捷键
        function handleGlobalDecision(decision) {
            const firstDecision = document.querySelector('.decision-item');
            if (firstDecision) {
                const requestId = firstDecision.id.replace('decision-', '');
                makeDecision(requestId, decision);
            }
        }

        // 显示详情
        function showDetails(requestId) {
            // 这里可以实现详情模态框
            console.log('Show details for:', requestId);
        }

        // 更新统计
        function updateStats() {
            const events = document.querySelectorAll('.event-item');
            let blocked = 0, allowed = 0, total = events.length;

            events.forEach(event => {
                if (event.classList.contains('event-blocked')) blocked++;
                if (event.classList.contains('event-allowed')) allowed++;
            });

            document.getElementById('blockedCount').textContent = blocked;
            document.getElementById('allowedCount').textContent = allowed;
            document.getElementById('totalCount').textContent = total;

            updatePendingCount();
        }

        // 更新待决策数量
        function updatePendingCount() {
            const pending = document.querySelectorAll('.decision-item').length;
            document.getElementById('pendingCount').textContent = pending;

            const trendElement = document.getElementById('pendingTrend');
            if (pending > 0) {
                trendElement.textContent = \`⚠️ \${pending} 个待处理\`;
                trendElement.style.color = 'var(--warning)';
            } else {
                trendElement.textContent = '⚡ 实时监控';
                trendElement.style.color = 'var(--text-muted)';
            }
        }

        // 更新图表
        function updateChart() {
            if (chart) {
                chart.data.datasets[0].data = hourlyData.map(d => d.blocked);
                chart.data.datasets[1].data = hourlyData.map(d => d.allowed);
                chart.update('none');
            }
        }

        // 清空事件
        function clearEvents() {
            const eventsList = document.getElementById('eventsList');
            eventsList.innerHTML = \`
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <div>等待安全事件...</div>
                    <div style="font-size: 12px; margin-top: 8px;">系统正在监控危险命令</div>
                </div>
            \`;

            // 清空图表数据
            hourlyData = Array(24).fill(0).map((_, hour) => ({ hour, blocked: 0, allowed: 0 }));
            updateChart();
            updateStats();

            // 通知服务器清空
            fetch('/clear-events', { method: 'POST' });
        }

        // 页面卸载时关闭连接
        window.addEventListener('beforeunload', function() {
            if (eventSource) {
                eventSource.close();
            }
        });
    </script>
</body>
</html>
  `;
}

// HTTP服务器
const server = http.createServer((req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getHTML());
  }
  else if (req.url === '/events') {
    // SSE连接
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    connections.push(res);

    // 发送初始数据
    res.write(`data: ${JSON.stringify({ type: 'init', stats, events: events.slice(0, 50) })}\n\n`);

    req.on('close', () => {
      connections = connections.filter(conn => conn !== res);
    });
  }
  else if (req.url === '/decision' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { requestId, decision, reason } = JSON.parse(body);
        handleDecision(requestId, decision, reason);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }
  else if (req.url === '/add-event' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const eventData = JSON.parse(body);
        // 将Hook发送的事件添加到监控界面
        addEvent(eventData.type, eventData.message, eventData.command, eventData.agent || 'Claude Code');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));

        console.log(`📡 收到Hook事件: ${eventData.type} - ${eventData.message}`);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }
  else if (req.url === '/clear-events' && req.method === 'POST') {
    events.length = 0;
    stats = { blocked: 0, allowed: 0, warning: 0, info: 0, total: 0 };
    hourlyStats = Array(24).fill(0).map((_, hour) => ({ hour, blocked: 0, allowed: 0 }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  }
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// 启动服务器
server.listen(WEB_PORT, () => {
  console.log(`🛡️ 启动 Aegis Enhanced 交互式监控...`);
  console.log(`🚀 Enhanced Web监控已启动`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🌐 监控界面: http://localhost:${WEB_PORT}`);
  console.log(`⚡ 特性: 现代化UI + 实时图表 + 快捷键操作`);
  console.log(`⌨️  快捷键: A(允许) D(拒绝) S(会话)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(``);

  // 添加一些示例事件用于演示
  addEvent('info', '🛡️ Aegis Enhanced Security Monitor 已启动', '', 'System');
  addEvent('info', '⚡ 实时监控系统已激活', '', 'System');

  // 模拟一些危险命令用于演示
  setTimeout(() => {
    simulateInterception('git push --force origin main', 'Claude Code');
  }, 3000);

  setTimeout(() => {
    simulateInterception('rm -rf /Users/test', 'Hermes');
  }, 8000);

  setTimeout(() => {
    simulateInterception('chmod 777 /etc/passwd', 'GPT-4');
  }, 15000);
});

// 信号处理
process.on('SIGINT', () => {
  console.log('\n\n👋 正在关闭 Aegis Enhanced 监控...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});