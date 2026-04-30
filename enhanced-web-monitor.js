#!/usr/bin/env node
/**
 * Aegis Enhanced Web Monitor - 增强版Web监控界面
 * 1. 支持接收Claude Hook拦截事件
 * 2. 支持中文/英文语言切换
 * 3. 现代化AI Dashboard设计
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const WEB_PORT = 3001;
const AEGIS_HOST = '127.0.0.1';
const AEGIS_PORT = 9876;
const LOG_PORT = 3005; // Claude Hook事件接收端口

// 存储拦截事件
let events = [];
let connections = [];
let stats = { blocked: 0, allowed: 0, warning: 0, info: 0, total: 0 };

// 语言包
const i18n = {
  'zh': {
    title: '🛡️ Aegis 安全监控中心',
    subtitle: 'AI Agent 安全操作拦截系统',
    status_online: '在线',
    status_offline: '离线',
    daemon_status: 'Daemon状态',
    ui_style: 'UI风格',
    modern_dashboard: '现代AI仪表板',
    stats_blocked: '已拦截',
    stats_allowed: '已允许',
    stats_warning: '警告',
    stats_total: '总计',
    empty_title: '等待拦截事件...',
    empty_desc: '在Claude Code中执行危险命令，事件会实时显示在这里',
    connection_established: '连接已建立',
    refresh: '刷新',
    lang_switch: '切换语言',
    events_title: '拦截事件',
    command_label: '命令',
    agent_label: '代理',
    time_label: '时间'
  },
  'en': {
    title: '🛡️ Aegis Security Monitor',
    subtitle: 'AI Agent Security Interception System',
    status_online: 'Online',
    status_offline: 'Offline',
    daemon_status: 'Daemon Status',
    ui_style: 'UI Style',
    modern_dashboard: 'Modern AI Dashboard',
    stats_blocked: 'Blocked',
    stats_allowed: 'Allowed',
    stats_warning: 'Warning',
    stats_total: 'Total',
    empty_title: 'Waiting for interception events...',
    empty_desc: 'Execute dangerous commands in Claude Code, events will appear here in real-time',
    connection_established: 'Connection established',
    refresh: 'Refresh',
    lang_switch: 'Switch Language',
    events_title: 'Interception Events',
    command_label: 'Command',
    agent_label: 'Agent',
    time_label: 'Time'
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

// 添加拦截事件
function addEvent(type, message, command = '', agent = 'Claude Code') {
  const event = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toLocaleString('zh-CN'),
    type,
    message,
    command: command.substring(0, 100),
    agent,
    time: new Date().toLocaleTimeString()
  };

  events.unshift(event);

  // 保持最多50条记录
  if (events.length > 50) {
    events = events.slice(0, 50);
  }

  // 更新统计
  stats[type]++;
  stats.total++;

  // 通知所有连接的客户端
  broadcastEvent(event);

  // 控制台输出
  console.log(`\n🛡️ [${event.time}] ${type.toUpperCase()}: ${message}`);
  if (command) {
    console.log(`📝 Command: ${command}`);
  }
}

// 广播事件到所有连接
function broadcastEvent(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  connections.forEach((res, index) => {
    try {
      res.write(data);
    } catch (e) {
      // 移除断开的连接
      connections.splice(index, 1);
    }
  });
}

// 创建Claude Hook事件接收服务器
function createHookReceiver() {
  const hookServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/hook-event') {
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
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  hookServer.listen(LOG_PORT, () => {
    console.log(`📨 Claude Hook接收器启动在端口 ${LOG_PORT}`);
  });

  return hookServer;
}

// 生成HTML页面
function getHTML(daemonStatus) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title id="page-title">🛡️ Aegis 安全监控中心</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: #ffffff;
            min-height: 100vh;
            padding: 20px;
            transition: all 0.3s ease;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 20px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.3);
            overflow: hidden;
            backdrop-filter: blur(15px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
            transform: rotate(45deg);
            animation: shimmer 3s infinite;
        }

        @keyframes shimmer {
            0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
            100% { transform: translateX(100%) translateY(100%) rotate(45deg); }
        }

        .header-content {
            position: relative;
            z-index: 1;
        }

        .title {
            font-size: 2.8em;
            font-weight: 700;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .subtitle {
            font-size: 1.3em;
            opacity: 0.9;
            margin-bottom: 20px;
        }

        .header-controls {
            position: absolute;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            z-index: 2;
        }

        .header-btn {
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 14px;
        }

        .header-btn:hover {
            background: rgba(255,255,255,0.3);
            transform: scale(1.05);
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            border-radius: 25px;
            font-weight: 600;
            font-size: 1.1em;
        }

        .status-online {
            background: linear-gradient(135deg, #00c9ff, #92fe9d);
            box-shadow: 0 4px 15px rgba(0, 201, 255, 0.4);
        }

        .status-offline {
            background: linear-gradient(135deg, #fc466b, #3f5efb);
            box-shadow: 0 4px 15px rgba(252, 70, 107, 0.4);
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: rgba(255, 255, 255, 0.02);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stat-item {
            text-align: center;
            padding: 25px 20px;
            background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
            border-radius: 15px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
        }

        .stat-item:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 30px rgba(0,0,0,0.2);
        }

        .stat-number {
            font-size: 3em;
            font-weight: 700;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        .stat-label {
            color: rgba(255, 255, 255, 0.8);
            font-size: 1em;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 500;
        }

        .blocked { color: #ff6b6b; }
        .allowed { color: #4ecdc4; }
        .warning { color: #ffe66d; }
        .info { color: #74c0fc; }

        .events-section {
            padding: 30px;
        }

        .section-title {
            font-size: 1.5em;
            font-weight: 600;
            margin-bottom: 20px;
            color: rgba(255, 255, 255, 0.9);
        }

        .events {
            max-height: 600px;
            overflow-y: auto;
            padding-right: 10px;
        }

        .events::-webkit-scrollbar {
            width: 6px;
        }

        .events::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
        }

        .events::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 3px;
        }

        .event-item {
            display: flex;
            align-items: center;
            padding: 20px;
            margin-bottom: 15px;
            border-radius: 15px;
            border-left: 4px solid;
            transition: all 0.3s ease;
            animation: slideInRight 0.5s ease;
            backdrop-filter: blur(10px);
        }

        .event-item:hover {
            transform: translateX(5px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }

        .event-blocked {
            background: linear-gradient(135deg, rgba(255, 107, 107, 0.15), rgba(255, 107, 107, 0.05));
            border-left-color: #ff6b6b;
        }

        .event-allowed {
            background: linear-gradient(135deg, rgba(78, 205, 196, 0.15), rgba(78, 205, 196, 0.05));
            border-left-color: #4ecdc4;
        }

        .event-warning {
            background: linear-gradient(135deg, rgba(255, 230, 109, 0.15), rgba(255, 230, 109, 0.05));
            border-left-color: #ffe66d;
        }

        .event-info {
            background: linear-gradient(135deg, rgba(116, 192, 252, 0.15), rgba(116, 192, 252, 0.05));
            border-left-color: #74c0fc;
        }

        .event-icon {
            font-size: 2.5em;
            margin-right: 20px;
            min-width: 60px;
            text-align: center;
        }

        .event-content {
            flex: 1;
            min-width: 0;
        }

        .event-message {
            font-weight: 600;
            margin-bottom: 10px;
            font-size: 1.1em;
            line-height: 1.4;
        }

        .event-command {
            background: rgba(0,0,0,0.3);
            padding: 10px 15px;
            border-radius: 8px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
            margin: 10px 0;
            word-break: break-all;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #f8f8f2;
        }

        .event-meta {
            color: rgba(255, 255, 255, 0.7);
            font-size: 0.9em;
            display: flex;
            gap: 20px;
            margin-top: 8px;
        }

        .empty-state {
            text-align: center;
            padding: 80px 20px;
            color: rgba(255, 255, 255, 0.6);
        }

        .empty-icon {
            font-size: 5em;
            margin-bottom: 20px;
            opacity: 0.7;
        }

        .empty-title {
            font-size: 1.5em;
            margin-bottom: 10px;
            font-weight: 600;
        }

        .empty-desc {
            font-size: 1.1em;
            opacity: 0.8;
            line-height: 1.5;
        }

        @keyframes slideInRight {
            from {
                opacity: 0;
                transform: translateX(30px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        .pulse {
            animation: pulse 2s infinite;
        }

        /* 语言切换功能 */
        .lang-hidden {
            display: none;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
            .container {
                margin: 10px;
                border-radius: 15px;
            }

            .title {
                font-size: 2.2em;
            }

            .stats {
                grid-template-columns: repeat(2, 1fr);
                gap: 15px;
                padding: 20px;
            }

            .stat-number {
                font-size: 2.2em;
            }

            .events-section {
                padding: 20px;
            }

            .event-item {
                flex-direction: column;
                text-align: center;
            }

            .event-icon {
                margin-right: 0;
                margin-bottom: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-controls">
                <button class="header-btn" onclick="switchLanguage()" data-lang-key="lang_switch">切换语言</button>
                <button class="header-btn" onclick="location.reload()" data-lang-key="refresh">刷新</button>
            </div>
            <div class="header-content">
                <div class="title" data-lang-key="title">🛡️ Aegis 安全监控中心</div>
                <div class="subtitle" data-lang-key="subtitle">AI Agent 安全操作拦截系统</div>
                <div class="status-badge ${daemonStatus ? 'status-online' : 'status-offline'}">
                    <span>${daemonStatus ? '🟢' : '🔴'}</span>
                    <span data-lang-key="daemon_status">Daemon状态</span>:
                    <span data-lang-key="${daemonStatus ? 'status_online' : 'status_offline'}">${daemonStatus ? '在线' : '离线'}</span>
                </div>
            </div>
        </div>

        <div class="stats">
            <div class="stat-item">
                <div class="stat-number blocked" id="blocked-count">0</div>
                <div class="stat-label" data-lang-key="stats_blocked">已拦截</div>
            </div>
            <div class="stat-item">
                <div class="stat-number allowed" id="allowed-count">0</div>
                <div class="stat-label" data-lang-key="stats_allowed">已允许</div>
            </div>
            <div class="stat-item">
                <div class="stat-number warning" id="warning-count">0</div>
                <div class="stat-label" data-lang-key="stats_warning">警告</div>
            </div>
            <div class="stat-item">
                <div class="stat-number" id="total-count">0</div>
                <div class="stat-label" data-lang-key="stats_total">总计</div>
            </div>
        </div>

        <div class="events-section">
            <div class="section-title" data-lang-key="events_title">拦截事件</div>
            <div class="events">
                <div id="events-list">
                    <div class="empty-state">
                        <div class="empty-icon">👁️‍🗨️</div>
                        <div class="empty-title" data-lang-key="empty_title">等待拦截事件...</div>
                        <div class="empty-desc" data-lang-key="empty_desc">在Claude Code中执行危险命令，事件会实时显示在这里</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let eventCounts = { blocked: 0, allowed: 0, warning: 0, info: 0 };
        let currentLang = 'zh';

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

        eventSource.onerror = function(event) {
            console.log('EventSource连接错误:', event);
        };

        function addEventToUI(event) {
            const eventsList = document.getElementById('events-list');

            // 移除空状态
            if (eventsList.querySelector('.empty-state')) {
                eventsList.innerHTML = '';
            }

            const eventDiv = document.createElement('div');
            eventDiv.className = \`event-item event-\${event.type}\`;

            const icons = {
                blocked: '🛡️',
                allowed: '✅',
                warning: '⚠️',
                info: '💡'
            };

            eventDiv.innerHTML = \`
                <div class="event-icon">\${icons[event.type] || '📝'}</div>
                <div class="event-content">
                    <div class="event-message">\${event.message}</div>
                    \${event.command ? \`<div class="event-command">\${event.command}</div>\` : ''}
                    <div class="event-meta">
                        <span>🎯 <span data-lang-key="agent_label">代理</span>: \${event.agent}</span>
                        <span>⏰ <span data-lang-key="time_label">时间</span>: \${event.timestamp}</span>
                    </div>
                </div>
            \`;

            eventsList.insertBefore(eventDiv, eventsList.firstChild);

            // 更新统计
            eventCounts[event.type]++;
            updateStats();

            // 保持最多25个事件显示
            while (eventsList.children.length > 25) {
                eventsList.removeChild(eventsList.lastChild);
            }

            // 更新新添加元素的语言
            updateLanguage();
        }

        function updateStats() {
            document.getElementById('blocked-count').textContent = eventCounts.blocked;
            document.getElementById('allowed-count').textContent = eventCounts.allowed;
            document.getElementById('warning-count').textContent = eventCounts.warning;
            document.getElementById('total-count').textContent =
                eventCounts.blocked + eventCounts.allowed + eventCounts.warning + eventCounts.info;
        }

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

            // 更新页面标题
            document.title = i18n[currentLang].title;
        }

        // 初始化欢迎消息
        setTimeout(() => {
            addEventToUI({
                type: 'info',
                message: currentLang === 'zh' ? 'Aegis 增强监控已启动 - 支持中英文切换' : 'Aegis Enhanced Monitor Started - Language switching supported',
                command: '',
                agent: 'System',
                timestamp: new Date().toLocaleString('zh-CN')
            });
        }, 1000);

        // 定期检查连接状态
        setInterval(() => {
            if (eventSource.readyState === EventSource.CLOSED) {
                console.log('连接已断开，尝试刷新...');
                location.reload();
            }
        }, 30000);
    </script>
</body>
</html>`;
}

// 创建主Web服务器
async function createWebMonitor() {
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

      // 发送初始事件
      res.write(`data: ${JSON.stringify({
        type: 'info',
        message: '连接已建立',
        command: '',
        agent: 'Web Monitor',
        timestamp: new Date().toLocaleString('zh-CN')
      })}\n\n`);

      req.on('close', () => {
        const index = connections.indexOf(res);
        if (index !== -1) {
          connections.splice(index, 1);
        }
      });
    }
    else if (url === '/add-event' && req.method === 'POST') {
      // 手动添加事件的API
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
    console.log('🚀 Aegis 增强Web监控已启动');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 监控界面: http://localhost:${WEB_PORT}`);
    console.log(`📊 Daemon状态: ${daemonStatus ? '🟢 在线' : '🔴 离线'}`);
    console.log(`🎨 特性: 中英文切换 + 实时拦截显示`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  });

  return { server, addEvent };
}

// 主函数
async function main() {
  console.log('🛡️ 启动 Aegis 增强Web监控...');

  const { server, addEvent: addEventFn } = await createWebMonitor();
  const hookServer = createHookReceiver();

  // 添加一些演示事件
  setTimeout(() => {
    addEventFn('info', '监控系统已启动', '', 'System');
  }, 2000);

  setTimeout(() => {
    addEventFn('blocked', 'Git强制推送被拦截 - 演示事件', 'git push --force origin main', 'Claude Code');
  }, 4000);

  setTimeout(() => {
    addEventFn('warning', '检测到潜在风险操作 - 演示事件', 'chmod 777 /etc/passwd', 'Claude Code');
  }, 6000);

  setTimeout(() => {
    addEventFn('allowed', '安全命令执行 - 演示事件', 'ls -la', 'Claude Code');
  }, 8000);

  process.on('SIGINT', () => {
    console.log('\n👋 增强Web监控停止中...');
    server.close(() => {
      hookServer.close(() => {
        console.log('✅ 增强Web监控已停止');
        process.exit(0);
      });
    });
  });

  // 导出全局函数供外部调用
  global.aegisAddEvent = addEventFn;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createWebMonitor, addEvent };