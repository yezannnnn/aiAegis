#!/usr/bin/env node
/**
 * Aegis Web Monitor - 简单的Web界面监控
 * 访问 http://localhost:3001 查看监控界面
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const WEB_PORT = 3001;
const AEGIS_HOST = '127.0.0.1';
const AEGIS_PORT = 9876;

// 存储拦截事件
let events = [];
let connections = [];

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
    id: Date.now(),
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

  // 通知所有连接的客户端
  broadcastEvent(event);
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

// HTML页面
function getHTML(daemonStatus) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🛡️ Aegis 监控中心</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            color: white;
            padding: 30px;
            text-align: center;
            position: relative;
        }

        .title {
            font-size: 2.5em;
            font-weight: 700;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .subtitle {
            font-size: 1.2em;
            opacity: 0.9;
            margin-bottom: 20px;
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
            background: linear-gradient(135deg, #27ae60, #2ecc71);
            box-shadow: 0 4px 15px rgba(39, 174, 96, 0.4);
        }

        .status-offline {
            background: linear-gradient(135deg, #e74c3c, #c0392b);
            box-shadow: 0 4px 15px rgba(231, 76, 60, 0.4);
        }

        .stats {
            display: flex;
            justify-content: space-around;
            padding: 30px;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border-bottom: 1px solid #dee2e6;
        }

        .stat-item {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 15px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
            min-width: 120px;
        }

        .stat-number {
            font-size: 2.5em;
            font-weight: 700;
            margin-bottom: 10px;
        }

        .stat-label {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .blocked { color: #e74c3c; }
        .allowed { color: #27ae60; }
        .warning { color: #f39c12; }

        .events {
            padding: 30px;
            max-height: 500px;
            overflow-y: auto;
        }

        .event-item {
            display: flex;
            align-items: center;
            padding: 20px;
            margin-bottom: 15px;
            border-radius: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            border-left: 5px solid;
            transition: all 0.3s ease;
            animation: slideIn 0.5s ease;
        }

        .event-item:hover {
            transform: translateX(5px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }

        .event-blocked {
            background: linear-gradient(135deg, #fff5f5, #fed7d7);
            border-left-color: #e53e3e;
        }

        .event-allowed {
            background: linear-gradient(135deg, #f0fff4, #c6f6d5);
            border-left-color: #38a169;
        }

        .event-warning {
            background: linear-gradient(135deg, #fffbeb, #fed7aa);
            border-left-color: #d69e2e;
        }

        .event-info {
            background: linear-gradient(135deg, #ebf8ff, #bee3f8);
            border-left-color: #3182ce;
        }

        .event-icon {
            font-size: 2em;
            margin-right: 20px;
            min-width: 50px;
            text-align: center;
        }

        .event-content {
            flex: 1;
        }

        .event-message {
            font-weight: 600;
            margin-bottom: 8px;
            font-size: 1.1em;
        }

        .event-command {
            background: rgba(0,0,0,0.1);
            padding: 8px 12px;
            border-radius: 8px;
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
            font-size: 0.9em;
            margin: 8px 0;
            word-break: break-all;
        }

        .event-meta {
            color: #666;
            font-size: 0.9em;
            display: flex;
            gap: 15px;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #999;
        }

        .empty-icon {
            font-size: 4em;
            margin-bottom: 20px;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateX(-20px);
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

        .refresh-btn {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .refresh-btn:hover {
            background: rgba(255,255,255,0.3);
            transform: scale(1.05);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <button class="refresh-btn" onclick="location.reload()">🔄 刷新</button>
            <div class="title">🛡️ Aegis 监控中心</div>
            <div class="subtitle">AI Agent 安全操作拦截系统</div>
            <div class="status-badge ${daemonStatus ? 'status-online' : 'status-offline'}">
                <span>${daemonStatus ? '🟢' : '🔴'}</span>
                <span>Daemon ${daemonStatus ? 'Online' : 'Offline'}</span>
            </div>
        </div>

        <div class="stats">
            <div class="stat-item">
                <div class="stat-number blocked" id="blocked-count">0</div>
                <div class="stat-label">已拦截</div>
            </div>
            <div class="stat-item">
                <div class="stat-number allowed" id="allowed-count">0</div>
                <div class="stat-label">已允许</div>
            </div>
            <div class="stat-item">
                <div class="stat-number warning" id="warning-count">0</div>
                <div class="stat-label">警告</div>
            </div>
            <div class="stat-item">
                <div class="stat-number" id="total-count">0</div>
                <div class="stat-label">总计</div>
            </div>
        </div>

        <div class="events">
            <div id="events-list">
                <div class="empty-state">
                    <div class="empty-icon">👀</div>
                    <h3>等待拦截事件...</h3>
                    <p>在Claude Code中执行危险命令，事件会实时显示在这里</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        let eventCounts = { blocked: 0, allowed: 0, warning: 0, info: 0 };

        // SSE连接
        const eventSource = new EventSource('/events');

        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            addEventToUI(data);
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
                        <span>🎯 \${event.agent}</span>
                        <span>⏰ \${event.timestamp}</span>
                    </div>
                </div>
            \`;

            eventsList.insertBefore(eventDiv, eventsList.firstChild);

            // 更新统计
            eventCounts[event.type]++;
            updateStats();

            // 保持最多20个事件显示
            while (eventsList.children.length > 20) {
                eventsList.removeChild(eventsList.lastChild);
            }
        }

        function updateStats() {
            document.getElementById('blocked-count').textContent = eventCounts.blocked;
            document.getElementById('allowed-count').textContent = eventCounts.allowed;
            document.getElementById('warning-count').textContent = eventCounts.warning;
            document.getElementById('total-count').textContent =
                eventCounts.blocked + eventCounts.allowed + eventCounts.warning + eventCounts.info;
        }

        // 初始化时添加欢迎消息
        setTimeout(() => {
            addEventToUI({
                type: 'info',
                message: 'Aegis Web Monitor 已启动',
                command: '',
                agent: 'System',
                timestamp: new Date().toLocaleString('zh-CN')
            });
        }, 1000);
    </script>
</body>
</html>`;
}

// 创建HTTP服务器
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
    else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(WEB_PORT, () => {
    console.log(`🌐 Aegis Web Monitor 已启动:`);
    console.log(`🔗 访问地址: http://localhost:${WEB_PORT}`);
    console.log(`📊 Daemon状态: ${daemonStatus ? '在线' : '离线'}`);
    console.log('');
  });

  return { server, addEvent };
}

// 主函数
async function main() {
  console.log('🛡️  启动 Aegis Web 监控...');

  const { server, addEvent: addEventFn } = await createWebMonitor();

  // 模拟一些事件用于演示
  setTimeout(() => {
    addEventFn('blocked', 'Git强制推送被拦截', 'git push --force origin main');
  }, 3000);

  setTimeout(() => {
    addEventFn('warning', '检测到潜在风险操作', 'sudo apt-get remove --purge');
  }, 5000);

  setTimeout(() => {
    addEventFn('allowed', '安全命令执行', 'ls -la');
  }, 7000);

  process.on('SIGINT', () => {
    console.log('\n👋 Web Monitor 停止中...');
    server.close(() => {
      console.log('✅ Web Monitor 已停止');
      process.exit(0);
    });
  });
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createWebMonitor };