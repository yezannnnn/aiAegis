#!/usr/bin/env node
/**
 * Aegis Modern Web Monitor - 现代化Dashboard风格监控界面
 * 参考现代AI Dashboard设计，专业级监控体验
 */

const http = require('http');
const net = require('net');
const { EventEmitter } = require('events');

const WEB_PORT = 3001;
const AEGIS_HOST = '127.0.0.1';
const AEGIS_PORT = 9876;

// 全局状态管理
const monitorState = new EventEmitter();
let events = [];
let connections = [];
let stats = { blocked: 0, allowed: 0, warning: 0, total: 0 };

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
function addEvent(type, message, command = '', agent = 'Claude Code', details = {}) {
  const event = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    localTime: new Date().toLocaleString('zh-CN'),
    type,
    message,
    command: command.substring(0, 150),
    agent,
    severity: getSeverityLevel(type),
    details
  };

  events.unshift(event);
  if (events.length > 100) events = events.slice(0, 100);

  stats[type]++;
  stats.total++;

  // 广播到所有连接
  broadcastEvent(event);
  return event;
}

function getSeverityLevel(type) {
  const levels = { blocked: 'high', warning: 'medium', allowed: 'low', info: 'low' };
  return levels[type] || 'low';
}

function broadcastEvent(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  connections.forEach((res, index) => {
    try {
      res.write(message);
    } catch (e) {
      connections.splice(index, 1);
    }
  });
}

// 现代化HTML Dashboard
function getModernHTML(daemonStatus) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aegis Security Dashboard</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0A0E27;
            --bg-secondary: #1A1F3A;
            --bg-card: #232946;
            --bg-hover: #2E3454;
            --accent-primary: #3B82F6;
            --accent-success: #10B981;
            --accent-warning: #F59E0B;
            --accent-danger: #EF4444;
            --accent-purple: #8B5CF6;
            --text-primary: #F8FAFC;
            --text-secondary: #94A3B8;
            --text-muted: #64748B;
            --border-color: #334155;
            --glow-blue: 0 0 20px rgba(59, 130, 246, 0.3);
            --glow-success: 0 0 20px rgba(16, 185, 129, 0.3);
            --glow-warning: 0 0 20px rgba(245, 158, 11, 0.3);
            --glow-danger: 0 0 20px rgba(239, 68, 68, 0.3);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            overflow-x: hidden;
        }

        .dashboard {
            min-height: 100vh;
            background: linear-gradient(135deg, var(--bg-primary) 0%, #0F172A 100%);
            position: relative;
        }

        /* 背景动画 */
        .bg-animation {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
        }

        .bg-particle {
            position: absolute;
            width: 2px;
            height: 2px;
            background: var(--accent-primary);
            border-radius: 50%;
            animation: float 20s infinite ease-in-out;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.3; }
            25% { transform: translateY(-20px) translateX(10px); opacity: 0.7; }
            50% { transform: translateY(0px) translateX(-10px); opacity: 1; }
            75% { transform: translateY(20px) translateX(5px); opacity: 0.5; }
        }

        /* 头部导航 */
        .navbar {
            position: sticky;
            top: 0;
            background: rgba(26, 31, 58, 0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border-color);
            padding: 1rem 2rem;
            z-index: 1000;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 1.5rem;
            font-weight: 700;
        }

        .logo-icon {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-purple));
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.3s ease;
        }

        .status-online {
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.1));
            border: 1px solid rgba(16, 185, 129, 0.3);
            color: var(--accent-success);
            box-shadow: var(--glow-success);
        }

        .status-offline {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1));
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: var(--accent-danger);
            box-shadow: var(--glow-danger);
        }

        .pulse {
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        /* 主要内容区域 */
        .main-content {
            position: relative;
            z-index: 1;
            padding: 2rem;
            max-width: 1400px;
            margin: 0 auto;
        }

        /* 统计卡片 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 1.5rem;
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
            background: linear-gradient(90deg, transparent, var(--accent-primary), transparent);
            transition: all 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-2px);
            border-color: var(--accent-primary);
            box-shadow: var(--glow-blue);
        }

        .stat-card:hover::before {
            background: linear-gradient(90deg, var(--accent-primary), var(--accent-purple), var(--accent-primary));
        }

        .stat-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }

        .stat-title {
            color: var(--text-secondary);
            font-size: 0.9rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .stat-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
        }

        .stat-number {
            font-size: 2.5rem;
            font-weight: 700;
            line-height: 1;
            margin-bottom: 0.5rem;
        }

        .stat-trend {
            font-size: 0.85rem;
            color: var(--text-muted);
        }

        .blocked-card { --card-color: var(--accent-danger); }
        .blocked-card .stat-icon { background: rgba(239, 68, 68, 0.2); color: var(--accent-danger); }
        .blocked-card .stat-number { color: var(--accent-danger); }

        .allowed-card { --card-color: var(--accent-success); }
        .allowed-card .stat-icon { background: rgba(16, 185, 129, 0.2); color: var(--accent-success); }
        .allowed-card .stat-number { color: var(--accent-success); }

        .warning-card { --card-color: var(--accent-warning); }
        .warning-card .stat-icon { background: rgba(245, 158, 11, 0.2); color: var(--accent-warning); }
        .warning-card .stat-number { color: var(--accent-warning); }

        .total-card { --card-color: var(--accent-primary); }
        .total-card .stat-icon { background: rgba(59, 130, 246, 0.2); color: var(--accent-primary); }
        .total-card .stat-number { color: var(--accent-primary); }

        /* 事件流区域 */
        .events-section {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            overflow: hidden;
        }

        .events-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(135deg, var(--bg-secondary), var(--bg-card));
        }

        .events-title {
            font-size: 1.2rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .events-filter {
            display: flex;
            gap: 8px;
        }

        .filter-btn {
            padding: 6px 12px;
            border: 1px solid var(--border-color);
            background: transparent;
            color: var(--text-secondary);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 0.85rem;
        }

        .filter-btn:hover,
        .filter-btn.active {
            background: var(--accent-primary);
            color: white;
            border-color: var(--accent-primary);
        }

        .events-list {
            max-height: 500px;
            overflow-y: auto;
            padding: 1rem;
        }

        /* 滚动条样式 */
        .events-list::-webkit-scrollbar {
            width: 6px;
        }

        .events-list::-webkit-scrollbar-track {
            background: var(--bg-secondary);
        }

        .events-list::-webkit-scrollbar-thumb {
            background: var(--accent-primary);
            border-radius: 3px;
        }

        /* 事件项 */
        .event-item {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            padding: 16px;
            margin-bottom: 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            transition: all 0.3s ease;
            animation: slideIn 0.5s ease;
        }

        .event-item:hover {
            transform: translateX(4px);
            border-color: var(--accent-primary);
            box-shadow: 0 4px 20px rgba(59, 130, 246, 0.1);
        }

        .event-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            font-weight: 600;
            flex-shrink: 0;
        }

        .event-blocked .event-icon {
            background: rgba(239, 68, 68, 0.2);
            color: var(--accent-danger);
            border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .event-allowed .event-icon {
            background: rgba(16, 185, 129, 0.2);
            color: var(--accent-success);
            border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .event-warning .event-icon {
            background: rgba(245, 158, 11, 0.2);
            color: var(--accent-warning);
            border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .event-info .event-icon {
            background: rgba(59, 130, 246, 0.2);
            color: var(--accent-primary);
            border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .event-content {
            flex: 1;
            min-width: 0;
        }

        .event-message {
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--text-primary);
            line-height: 1.4;
        }

        .event-command {
            background: rgba(0, 0, 0, 0.3);
            padding: 8px 12px;
            border-radius: 8px;
            font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
            font-size: 0.85rem;
            margin: 8px 0;
            word-break: break-all;
            border-left: 3px solid var(--accent-primary);
            color: var(--text-secondary);
        }

        .event-meta {
            display: flex;
            gap: 16px;
            color: var(--text-muted);
            font-size: 0.8rem;
            margin-top: 8px;
        }

        .event-meta span {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .severity-high { border-left-color: var(--accent-danger); }
        .severity-medium { border-left-color: var(--accent-warning); }
        .severity-low { border-left-color: var(--accent-success); }

        /* 空状态 */
        .empty-state {
            text-align: center;
            padding: 3rem;
            color: var(--text-muted);
        }

        .empty-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
            opacity: 0.5;
        }

        .empty-title {
            font-size: 1.2rem;
            margin-bottom: 0.5rem;
            color: var(--text-secondary);
        }

        /* 动画 */
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @keyframes countUp {
            from { opacity: 0; transform: scale(0.5); }
            to { opacity: 1; transform: scale(1); }
        }

        .count-animate {
            animation: countUp 0.6s ease;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
            .navbar { padding: 1rem; }
            .main-content { padding: 1rem; }
            .stats-grid { grid-template-columns: 1fr; gap: 1rem; }
            .events-header { flex-direction: column; gap: 1rem; align-items: flex-start; }
            .events-filter { width: 100%; justify-content: space-between; }
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <!-- 背景动画 -->
        <div class="bg-animation" id="bgAnimation"></div>

        <!-- 导航栏 -->
        <nav class="navbar">
            <div class="logo">
                <div class="logo-icon">🛡️</div>
                <div>
                    <div style="line-height: 1;">Aegis Security</div>
                    <div style="font-size: 0.7rem; font-weight: 400; opacity: 0.7;">AI Agent Monitor</div>
                </div>
            </div>
            <div class="status-indicator ${daemonStatus ? 'status-online' : 'status-offline'} ${daemonStatus ? 'pulse' : ''}">
                <i class="fas fa-${daemonStatus ? 'shield-alt' : 'exclamation-triangle'}"></i>
                <span>Daemon ${daemonStatus ? 'Online' : 'Offline'}</span>
            </div>
        </nav>

        <main class="main-content">
            <!-- 统计卡片 -->
            <section class="stats-grid">
                <div class="stat-card blocked-card">
                    <div class="stat-header">
                        <span class="stat-title">Blocked Commands</span>
                        <div class="stat-icon"><i class="fas fa-ban"></i></div>
                    </div>
                    <div class="stat-number" id="blocked-count">0</div>
                    <div class="stat-trend">High-risk operations intercepted</div>
                </div>

                <div class="stat-card allowed-card">
                    <div class="stat-header">
                        <span class="stat-title">Allowed Commands</span>
                        <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                    </div>
                    <div class="stat-number" id="allowed-count">0</div>
                    <div class="stat-trend">Safe operations executed</div>
                </div>

                <div class="stat-card warning-card">
                    <div class="stat-header">
                        <span class="stat-title">Warnings</span>
                        <div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div>
                    </div>
                    <div class="stat-number" id="warning-count">0</div>
                    <div class="stat-trend">Potentially risky operations</div>
                </div>

                <div class="stat-card total-card">
                    <div class="stat-header">
                        <span class="stat-title">Total Events</span>
                        <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                    </div>
                    <div class="stat-number" id="total-count">0</div>
                    <div class="stat-trend">All monitored operations</div>
                </div>
            </section>

            <!-- 事件流 -->
            <section class="events-section">
                <div class="events-header">
                    <div class="events-title">
                        <i class="fas fa-stream"></i>
                        Real-time Event Stream
                    </div>
                    <div class="events-filter">
                        <button class="filter-btn active" data-filter="all">All</button>
                        <button class="filter-btn" data-filter="blocked">Blocked</button>
                        <button class="filter-btn" data-filter="warning">Warnings</button>
                        <button class="filter-btn" data-filter="allowed">Allowed</button>
                    </div>
                </div>
                <div class="events-list" id="events-list">
                    <div class="empty-state">
                        <div class="empty-icon">🎯</div>
                        <div class="empty-title">Monitoring Active</div>
                        <p>Execute commands in Claude Code to see security events appear here in real-time</p>
                    </div>
                </div>
            </section>
        </main>
    </div>

    <script>
        let eventCounts = { blocked: 0, allowed: 0, warning: 0, info: 0 };
        let currentFilter = 'all';

        // 创建背景动画
        function createBgAnimation() {
            const container = document.getElementById('bgAnimation');
            for (let i = 0; i < 15; i++) {
                const particle = document.createElement('div');
                particle.className = 'bg-particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.top = Math.random() * 100 + '%';
                particle.style.animationDelay = Math.random() * 20 + 's';
                container.appendChild(particle);
            }
        }

        // SSE连接
        const eventSource = new EventSource('/events');

        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            addEventToUI(data);
        };

        // 过滤器
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelector('.filter-btn.active').classList.remove('active');
                this.classList.add('active');
                currentFilter = this.dataset.filter;
                filterEvents();
            });
        });

        function addEventToUI(event) {
            const eventsList = document.getElementById('events-list');

            // 移除空状态
            if (eventsList.querySelector('.empty-state')) {
                eventsList.innerHTML = '';
            }

            const eventDiv = document.createElement('div');
            eventDiv.className = \`event-item event-\${event.type} severity-\${event.severity}\`;
            eventDiv.dataset.type = event.type;

            const icons = {
                blocked: '<i class="fas fa-ban"></i>',
                allowed: '<i class="fas fa-check"></i>',
                warning: '<i class="fas fa-exclamation-triangle"></i>',
                info: '<i class="fas fa-info-circle"></i>'
            };

            eventDiv.innerHTML = \`
                <div class="event-icon">\${icons[event.type] || icons.info}</div>
                <div class="event-content">
                    <div class="event-message">\${event.message}</div>
                    \${event.command ? \`<div class="event-command">\${event.command}</div>\` : ''}
                    <div class="event-meta">
                        <span><i class="fas fa-robot"></i> \${event.agent}</span>
                        <span><i class="fas fa-clock"></i> \${new Date(event.timestamp).toLocaleTimeString('zh-CN')}</span>
                        <span><i class="fas fa-exclamation-circle"></i> \${event.severity.toUpperCase()}</span>
                    </div>
                </div>
            \`;

            eventsList.insertBefore(eventDiv, eventsList.firstChild);

            // 更新统计并添加动画
            eventCounts[event.type]++;
            updateStats();

            // 应用过滤器
            filterEvents();

            // 保持最多30个事件
            while (eventsList.children.length > 30) {
                eventsList.removeChild(eventsList.lastChild);
            }
        }

        function updateStats() {
            const total = Object.values(eventCounts).reduce((a, b) => a + b, 0);

            document.getElementById('blocked-count').textContent = eventCounts.blocked;
            document.getElementById('allowed-count').textContent = eventCounts.allowed;
            document.getElementById('warning-count').textContent = eventCounts.warning;
            document.getElementById('total-count').textContent = total;

            // 添加计数动画
            document.querySelectorAll('.stat-number').forEach(el => {
                el.classList.add('count-animate');
                setTimeout(() => el.classList.remove('count-animate'), 600);
            });
        }

        function filterEvents() {
            const events = document.querySelectorAll('.event-item');
            events.forEach(event => {
                if (currentFilter === 'all' || event.dataset.type === currentFilter) {
                    event.style.display = 'flex';
                } else {
                    event.style.display = 'none';
                }
            });
        }

        // 初始化
        createBgAnimation();

        // 添加欢迎消息
        setTimeout(() => {
            addEventToUI({
                type: 'info',
                message: 'Aegis Security Dashboard Initialized',
                command: '',
                agent: 'System',
                timestamp: new Date().toISOString(),
                severity: 'low'
            });
        }, 1500);

        // 定期检查连接状态
        setInterval(() => {
            if (eventSource.readyState === EventSource.CLOSED) {
                console.log('Reconnecting to event stream...');
                location.reload();
            }
        }, 30000);
    </script>
</body>
</html>`;
}

// HTTP服务器
async function createModernWebMonitor() {
  const daemonStatus = await checkAegisDaemon();

  const server = http.createServer(async (req, res) => {
    const url = req.url;

    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getModernHTML(daemonStatus));
    }
    else if (url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      connections.push(res);

      // 发送初始连接确认
      res.write(`data: ${JSON.stringify({
        type: 'info',
        message: 'Dashboard Connected',
        command: '',
        agent: 'Web Monitor',
        timestamp: new Date().toISOString(),
        severity: 'low'
      })}\n\n`);

      req.on('close', () => {
        const index = connections.indexOf(res);
        if (index !== -1) connections.splice(index, 1);
      });
    }
    else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(WEB_PORT, () => {
    console.log('🚀 Aegis Modern Dashboard Started');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 Dashboard URL: http://localhost:${WEB_PORT}`);
    console.log(`📊 Daemon Status: ${daemonStatus ? '🟢 Online' : '🔴 Offline'}`);
    console.log(`🎨 UI Style: Modern AI Dashboard`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  });

  return { server, addEvent };
}

// 主函数
async function main() {
  console.log('🎨 Starting Modern Aegis Dashboard...');

  const { addEvent: addEventFn } = await createModernWebMonitor();

  // 演示事件
  setTimeout(() => {
    addEventFn('info', 'Security monitoring initialized', '', 'Aegis System');
  }, 2000);

  setTimeout(() => {
    addEventFn('blocked', 'Git force push intercepted', 'git push --force origin main', 'Claude Code', {
      riskLevel: 'HIGH',
      reason: 'Force push to main branch detected'
    });
  }, 4000);

  setTimeout(() => {
    addEventFn('warning', 'Sudo operation detected', 'sudo apt-get update', 'Claude Code', {
      riskLevel: 'MEDIUM',
      reason: 'Elevated privileges required'
    });
  }, 6000);

  setTimeout(() => {
    addEventFn('allowed', 'Safe file operation', 'ls -la package.json', 'Claude Code', {
      riskLevel: 'LOW',
      reason: 'Read-only file system operation'
    });
  }, 8000);

  process.on('SIGINT', () => {
    console.log('\\n👋 Modern Dashboard shutting down...');
    process.exit(0);
  });

  return addEventFn;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createModernWebMonitor, addEvent };