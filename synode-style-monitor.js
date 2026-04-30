#!/usr/bin/env node
/**
 * Aegis SyNode Style Web Monitor - 基于 synodeai.com/dashboard 风格设计
 * 特点：现代化深色主题、科技感渐变、专业AI仪表板风格
 */

const http = require('http');
const net = require('net');

const WEB_PORT = 3001;
const AEGIS_HOST = '127.0.0.1';
const AEGIS_PORT = 9876;

// 存储拦截事件
let events = [];
let connections = [];
let stats = { blocked: 0, allowed: 0, warning: 0, info: 0, total: 0 };

// 多语言支持
const i18n = {
  'zh': {
    title: '🛡️ Aegis 安全监控',
    subtitle: 'AI 代理安全拦截系统',
    status_online: '在线',
    status_offline: '离线',
    daemon_status: '守护进程状态',
    stats_blocked: '已拦截',
    stats_allowed: '已允许',
    stats_warning: '警告',
    stats_total: '总计',
    events_title: '实时事件流',
    empty_title: '等待安全事件',
    empty_desc: '系统正在监控所有AI代理操作，危险命令将被实时拦截',
    refresh: '刷新',
    lang_switch: '中/EN',
    system_info: '系统信息',
    security_level: '安全等级',
    active_agents: '活跃代理'
  },
  'en': {
    title: '🛡️ Aegis Security Monitor',
    subtitle: 'AI Agent Security Interception System',
    status_online: 'Online',
    status_offline: 'Offline',
    daemon_status: 'Daemon Status',
    stats_blocked: 'Blocked',
    stats_allowed: 'Allowed',
    stats_warning: 'Warning',
    stats_total: 'Total',
    events_title: 'Real-time Event Stream',
    empty_title: 'Waiting for Security Events',
    empty_desc: 'System is monitoring all AI agent operations, dangerous commands will be intercepted in real-time',
    refresh: 'Refresh',
    lang_switch: 'EN/中',
    system_info: 'System Info',
    security_level: 'Security Level',
    active_agents: 'Active Agents'
  }
};

// 检查Aegis daemon状态
async function checkAegisDaemon() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.connect(AEGIS_PORT, AEGIS_HOST, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// 添加事件
function addEvent(type, message, command = '', agent = 'Claude Code') {
  const event = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toLocaleString('zh-CN'),
    type,
    message,
    command: command.substring(0, 120),
    agent,
    time: new Date().toLocaleTimeString(),
    severity: getSeverityLevel(type)
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

function getSeverityLevel(type) {
  const levels = { blocked: 'HIGH', warning: 'MEDIUM', allowed: 'LOW', info: 'INFO' };
  return levels[type] || 'UNKNOWN';
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

// SyNode风格HTML页面
function getHTML(daemonStatus) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title id="page-title">🛡️ Aegis 安全监控</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            /* SyNode风格色系 */
            --bg-primary: #0A0F1C;
            --bg-secondary: #111827;
            --bg-tertiary: #1F2937;
            --bg-card: #111827;
            --bg-hover: #1F2937;
            --accent-primary: #3B82F6;
            --accent-secondary: #8B5CF6;
            --accent-success: #10B981;
            --accent-warning: #F59E0B;
            --accent-danger: #EF4444;
            --accent-info: #06B6D4;
            --text-primary: #F9FAFB;
            --text-secondary: #D1D5DB;
            --text-muted: #9CA3AF;
            --border-color: #374151;
            --border-hover: #4B5563;
            --shadow-primary: rgba(59, 130, 246, 0.15);
            --shadow-secondary: rgba(0, 0, 0, 0.5);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            overflow-x: hidden;
            line-height: 1.6;
        }

        /* 科技感背景 */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                        radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                        linear-gradient(135deg, var(--bg-primary) 0%, #0F172A 100%);
            pointer-events: none;
            z-index: -1;
        }

        /* 主容器 */
        .dashboard {
            display: grid;
            grid-template-columns: 280px 1fr;
            min-height: 100vh;
            gap: 0;
        }

        /* 侧边栏 */
        .sidebar {
            background: var(--bg-secondary);
            border-right: 1px solid var(--border-color);
            padding: 24px;
            display: flex;
            flex-direction: column;
            backdrop-filter: blur(20px);
        }

        .sidebar-header {
            margin-bottom: 32px;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .logo-icon {
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
        }

        .logo-text {
            font-size: 20px;
            font-weight: 700;
            color: var(--text-primary);
        }

        .logo-subtitle {
            font-size: 14px;
            color: var(--text-muted);
            font-weight: 400;
        }

        /* 侧边栏导航 */
        .nav-section {
            margin-bottom: 24px;
        }

        .nav-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 8px;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            border-radius: 8px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 14px;
            font-weight: 500;
        }

        .nav-item:hover,
        .nav-item.active {
            background: var(--bg-hover);
            color: var(--text-primary);
        }

        .nav-item.active {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.1));
            border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .nav-icon {
            width: 16px;
            height: 16px;
            opacity: 0.7;
        }

        /* 主内容区 */
        .main-content {
            padding: 24px;
            overflow-y: auto;
        }

        /* 顶部标题栏 */
        .header {
            display: flex;
            justify-content: between;
            align-items: center;
            margin-bottom: 32px;
            padding: 20px 24px;
            background: var(--bg-card);
            border-radius: 12px;
            border: 1px solid var(--border-color);
            backdrop-filter: blur(20px);
        }

        .header-left {
            flex: 1;
        }

        .header-title {
            font-size: 28px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 4px;
        }

        .header-subtitle {
            font-size: 14px;
            color: var(--text-muted);
        }

        .header-controls {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .header-btn {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header-btn:hover {
            background: var(--bg-hover);
            border-color: var(--border-hover);
            color: var(--text-primary);
        }

        /* 状态指示器 */
        .status-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .status-online {
            background: rgba(16, 185, 129, 0.1);
            color: var(--accent-success);
            border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .status-offline {
            background: rgba(239, 68, 68, 0.1);
            color: var(--accent-danger);
            border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* 统计卡片网格 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 32px;
        }

        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, var(--card-accent, var(--accent-primary)), transparent);
        }

        .stat-card:hover {
            border-color: var(--border-hover);
            transform: translateY(-2px);
            box-shadow: 0 8px 32px var(--shadow-secondary);
        }

        .stat-card.blocked { --card-accent: var(--accent-danger); }
        .stat-card.allowed { --card-accent: var(--accent-success); }
        .stat-card.warning { --card-accent: var(--accent-warning); }
        .stat-card.total { --card-accent: var(--accent-info); }

        .stat-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .stat-title {
            font-size: 14px;
            color: var(--text-muted);
            font-weight: 500;
        }

        .stat-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            background: var(--bg-tertiary);
        }

        .stat-value {
            font-size: 32px;
            font-weight: 800;
            color: var(--text-primary);
            margin-bottom: 4px;
        }

        .stat-change {
            font-size: 12px;
            color: var(--text-muted);
        }

        /* 事件流区域 */
        .events-container {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            overflow: hidden;
        }

        .events-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .events-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .events-filters {
            display: flex;
            gap: 8px;
        }

        .filter-btn {
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            border: 1px solid var(--border-color);
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .filter-btn:hover,
        .filter-btn.active {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .events-list {
            max-height: 500px;
            overflow-y: auto;
        }

        .event-item {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 24px;
            border-bottom: 1px solid var(--border-color);
            transition: all 0.2s ease;
        }

        .event-item:hover {
            background: var(--bg-hover);
        }

        .event-item:last-child {
            border-bottom: none;
        }

        .event-status {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
        }

        .event-blocked .event-status {
            background: rgba(239, 68, 68, 0.1);
            color: var(--accent-danger);
        }

        .event-allowed .event-status {
            background: rgba(16, 185, 129, 0.1);
            color: var(--accent-success);
        }

        .event-warning .event-status {
            background: rgba(245, 158, 11, 0.1);
            color: var(--accent-warning);
        }

        .event-info .event-status {
            background: rgba(6, 182, 212, 0.1);
            color: var(--accent-info);
        }

        .event-content {
            flex: 1;
            min-width: 0;
        }

        .event-message {
            font-size: 14px;
            font-weight: 500;
            color: var(--text-primary);
            margin-bottom: 4px;
        }

        .event-details {
            font-size: 12px;
            color: var(--text-muted);
            display: flex;
            gap: 16px;
        }

        .event-command {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 8px 12px;
            margin: 8px 0 0 0;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 11px;
            color: var(--text-secondary);
            word-break: break-all;
        }

        .event-time {
            font-size: 12px;
            color: var(--text-muted);
            white-space: nowrap;
        }

        /* 空状态 */
        .empty-state {
            text-align: center;
            padding: 64px 24px;
            color: var(--text-muted);
        }

        .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .empty-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }

        .empty-description {
            font-size: 14px;
            line-height: 1.5;
        }

        /* 响应式设计 */
        @media (max-width: 1024px) {
            .dashboard {
                grid-template-columns: 1fr;
            }

            .sidebar {
                display: none;
            }

            .stats-grid {
                grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                gap: 16px;
            }
        }

        @media (max-width: 768px) {
            .main-content {
                padding: 16px;
            }

            .header {
                flex-direction: column;
                gap: 16px;
                text-align: center;
            }

            .header-controls {
                justify-content: center;
            }

            .stats-grid {
                grid-template-columns: 1fr;
            }
        }

        /* 滚动条样式 */
        .events-list::-webkit-scrollbar {
            width: 6px;
        }

        .events-list::-webkit-scrollbar-track {
            background: var(--bg-tertiary);
        }

        .events-list::-webkit-scrollbar-thumb {
            background: var(--border-color);
            border-radius: 3px;
        }

        .events-list::-webkit-scrollbar-thumb:hover {
            background: var(--border-hover);
        }

        /* 动画效果 */
        .slide-in {
            animation: slideIn 0.3s ease-out forwards;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <!-- 侧边栏 -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <div class="logo">
                    <div class="logo-icon">🛡️</div>
                    <div>
                        <div class="logo-text" data-lang-key="title">Aegis</div>
                        <div class="logo-subtitle" data-lang-key="subtitle">安全监控</div>
                    </div>
                </div>
            </div>

            <nav>
                <div class="nav-section">
                    <div class="nav-title" data-lang-key="system_info">系统信息</div>
                    <div class="nav-item active">
                        <span class="nav-icon">📊</span>
                        <span data-lang-key="events_title">事件监控</span>
                    </div>
                    <div class="nav-item">
                        <span class="nav-icon">⚙️</span>
                        <span>配置管理</span>
                    </div>
                    <div class="nav-item">
                        <span class="nav-icon">📈</span>
                        <span>性能监控</span>
                    </div>
                </div>

                <div class="nav-section">
                    <div class="nav-title" data-lang-key="security_level">安全等级</div>
                    <div class="nav-item">
                        <span class="nav-icon">🔒</span>
                        <span>规则管理</span>
                    </div>
                    <div class="nav-item">
                        <span class="nav-icon">👥</span>
                        <span data-lang-key="active_agents">AI 代理</span>
                    </div>
                </div>
            </nav>

            <div style="margin-top: auto;">
                <div class="nav-item">
                    <span class="nav-icon">🌐</span>
                    <span onclick="switchLanguage()" style="cursor: pointer;" data-lang-key="lang_switch">中/EN</span>
                </div>
            </div>
        </aside>

        <!-- 主内容区 -->
        <main class="main-content">
            <!-- 顶部标题栏 -->
            <div class="header">
                <div class="header-left">
                    <h1 class="header-title" data-lang-key="title">🛡️ Aegis 安全监控</h1>
                    <p class="header-subtitle" data-lang-key="subtitle">AI 代理安全拦截系统</p>
                </div>
                <div class="header-controls">
                    <div class="status-indicator ${daemonStatus ? 'status-online' : 'status-offline'}">
                        <span class="status-dot"></span>
                        <span data-lang-key="${daemonStatus ? 'status_online' : 'status_offline'}">${daemonStatus ? '在线' : '离线'}</span>
                    </div>
                    <button class="header-btn" onclick="location.reload()">
                        <span>🔄</span>
                        <span data-lang-key="refresh">刷新</span>
                    </button>
                </div>
            </div>

            <!-- 统计卡片 -->
            <div class="stats-grid">
                <div class="stat-card blocked">
                    <div class="stat-header">
                        <div class="stat-title" data-lang-key="stats_blocked">已拦截</div>
                        <div class="stat-icon">🛡️</div>
                    </div>
                    <div class="stat-value" id="blocked-count">0</div>
                    <div class="stat-change">高风险操作</div>
                </div>

                <div class="stat-card allowed">
                    <div class="stat-header">
                        <div class="stat-title" data-lang-key="stats_allowed">已允许</div>
                        <div class="stat-icon">✅</div>
                    </div>
                    <div class="stat-value" id="allowed-count">0</div>
                    <div class="stat-change">安全操作</div>
                </div>

                <div class="stat-card warning">
                    <div class="stat-header">
                        <div class="stat-title" data-lang-key="stats_warning">警告</div>
                        <div class="stat-icon">⚠️</div>
                    </div>
                    <div class="stat-value" id="warning-count">0</div>
                    <div class="stat-change">需要注意</div>
                </div>

                <div class="stat-card total">
                    <div class="stat-header">
                        <div class="stat-title" data-lang-key="stats_total">总计</div>
                        <div class="stat-icon">📊</div>
                    </div>
                    <div class="stat-value" id="total-count">0</div>
                    <div class="stat-change">所有事件</div>
                </div>
            </div>

            <!-- 事件流 -->
            <div class="events-container">
                <div class="events-header">
                    <h2 class="events-title" data-lang-key="events_title">实时事件流</h2>
                    <div class="events-filters">
                        <button class="filter-btn active" data-filter="all">全部</button>
                        <button class="filter-btn" data-filter="blocked">拦截</button>
                        <button class="filter-btn" data-filter="warning">警告</button>
                        <button class="filter-btn" data-filter="allowed">允许</button>
                    </div>
                </div>
                <div class="events-list" id="events-list">
                    <div class="empty-state">
                        <div class="empty-icon">👁️</div>
                        <div class="empty-title" data-lang-key="empty_title">等待安全事件</div>
                        <div class="empty-description" data-lang-key="empty_desc">系统正在监控所有AI代理操作，危险命令将被实时拦截</div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        let eventCounts = { blocked: 0, allowed: 0, warning: 0, info: 0 };
        let currentLang = 'zh';
        let currentFilter = 'all';

        const i18n = ${JSON.stringify(i18n)};

        // SSE连接
        const eventSource = new EventSource('/events');

        eventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                addEventToUI(data);
            } catch (e) {
                console.error('解析事件数据失败:', e);
            }
        };

        // 添加事件到UI
        function addEventToUI(event) {
            const eventsList = document.getElementById('events-list');

            // 移除空状态
            if (eventsList.querySelector('.empty-state')) {
                eventsList.innerHTML = '';
            }

            const eventDiv = document.createElement('div');
            eventDiv.className = \`event-item event-\${event.type} slide-in\`;

            const icons = {
                blocked: '🛡️',
                allowed: '✅',
                warning: '⚠️',
                info: '💡'
            };

            eventDiv.innerHTML = \`
                <div class="event-status">
                    \${icons[event.type] || '📝'}
                </div>
                <div class="event-content">
                    <div class="event-message">\${event.message}</div>
                    <div class="event-details">
                        <span>🎯 \${event.agent}</span>
                        <span>⏰ \${event.timestamp}</span>
                        <span>🔒 \${event.severity || 'INFO'}</span>
                    </div>
                    \${event.command ? \`<div class="event-command">\${event.command}</div>\` : ''}
                </div>
                <div class="event-time">\${event.time}</div>
            \`;

            // 检查过滤器
            if (currentFilter === 'all' || currentFilter === event.type) {
                eventsList.insertBefore(eventDiv, eventsList.firstChild);
            }

            // 更新统计
            eventCounts[event.type]++;
            updateStats();

            // 保持最多30个事件
            while (eventsList.children.length > 30) {
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

        // 语言切换
        function switchLanguage() {
            currentLang = currentLang === 'zh' ? 'en' : 'zh';
            updateLanguage();
        }

        function updateLanguage() {
            const elements = document.querySelectorAll('[data-lang-key]');
            elements.forEach(element => {
                const key = element.getAttribute('data-lang-key');
                if (i18n[currentLang] && i18n[currentLang][key]) {
                    element.textContent = i18n[currentLang][key];
                }
            });
            document.title = i18n[currentLang].title;
        }

        // 事件过滤
        document.addEventListener('DOMContentLoaded', function() {
            const filterButtons = document.querySelectorAll('.filter-btn');
            filterButtons.forEach(btn => {
                btn.addEventListener('click', function() {
                    // 移除活跃状态
                    filterButtons.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');

                    currentFilter = this.getAttribute('data-filter');
                    filterEvents();
                });
            });
        });

        function filterEvents() {
            const eventItems = document.querySelectorAll('.event-item');
            eventItems.forEach(item => {
                const eventType = Array.from(item.classList).find(cls =>
                    cls.startsWith('event-') && cls !== 'event-item'
                )?.replace('event-', '');

                if (currentFilter === 'all' || currentFilter === eventType) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        }

        // 初始化
        setTimeout(() => {
            addEventToUI({
                type: 'info',
                message: currentLang === 'zh' ? 'Aegis SyNode风格监控已启动' : 'Aegis SyNode Style Monitor Started',
                command: '',
                agent: 'System',
                timestamp: new Date().toLocaleString('zh-CN'),
                time: new Date().toLocaleTimeString(),
                severity: 'INFO'
            });
        }, 1000);
    </script>
</body>
</html>`;
}

// 创建Web服务器
async function createSyNodeMonitor() {
  const daemonStatus = await checkAegisDaemon();

  const server = http.createServer(async (req, res) => {
    const url = req.url;

    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHTML(daemonStatus));
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

      // 发送初始连接事件
      res.write(`data: ${JSON.stringify({
        type: 'info',
        message: '连接已建立',
        command: '',
        agent: 'Web Monitor',
        timestamp: new Date().toLocaleString('zh-CN'),
        time: new Date().toLocaleTimeString()
      })}\n\n`);

      req.on('close', () => {
        const index = connections.indexOf(res);
        if (index !== -1) {
          connections.splice(index, 1);
        }
      });
    }
    else if (url === '/add-event' && req.method === 'POST') {
      // API端点：手动添加事件
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const eventData = JSON.parse(body);
          addEvent(eventData.type, eventData.message, eventData.command, eventData.agent);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"status":"ok"}');
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
    console.log('🚀 Aegis SyNode风格监控已启动');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 监控界面: http://localhost:${WEB_PORT}`);
    console.log(`📊 Daemon状态: ${daemonStatus ? '🟢 在线' : '🔴 离线'}`);
    console.log(`🎨 UI风格: SyNode AI Dashboard`);
    console.log(`✨ 特性: 中英文切换 + 事件过滤 + 实时监控`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  });

  return { server, addEvent };
}

// 主函数
async function main() {
  console.log('🛡️ 启动 Aegis SyNode风格监控...');

  const { server, addEvent: addEventFn } = await createSyNodeMonitor();

  // 演示事件
  setTimeout(() => {
    addEventFn('info', '监控系统已启动', '', 'System');
  }, 2000);

  setTimeout(() => {
    addEventFn('blocked', 'Git强制推送被拦截', 'git push --force origin main', 'Claude Code');
  }, 4000);

  setTimeout(() => {
    addEventFn('warning', '检测到权限修改操作', 'chmod 777 /etc/passwd', 'Hermes');
  }, 6000);

  setTimeout(() => {
    addEventFn('allowed', '安全文件列表操作', 'ls -la', 'Claude Code');
  }, 8000);

  setTimeout(() => {
    addEventFn('blocked', '危险删除操作被阻止', 'rm -rf /Users/data', 'GPT-4');
  }, 10000);

  process.on('SIGINT', () => {
    console.log('\n👋 SyNode风格监控停止中...');
    server.close(() => {
      console.log('✅ SyNode风格监控已停止');
      process.exit(0);
    });
  });

  // 导出全局函数
  global.aegisAddEvent = addEventFn;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createSyNodeMonitor, addEvent };