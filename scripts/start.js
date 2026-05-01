#!/usr/bin/env node

/**
 * Aegis Start Script - npm start
 * 一键启动前后端服务
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

class AegisNpmStart {
  constructor() {
    this.aegisDir = path.join(os.homedir(), '.aegis');
    this.configFile = path.join(this.aegisDir, 'config.json');
    this.pidFile = path.join(this.aegisDir, 'server.pid');
    this.eventFile = path.join(os.tmpdir(), '.aegis-events.json');

    this.servers = [];
    this.isShuttingDown = false;
  }

  async run() {
    console.log('🚀 Aegis 启动服务');
    console.log('==================');
    console.log('');

    try {
      await this.checkSetup();
      await this.startBackendService();
      await this.startWebInterface();
      await this.registerShutdownHandlers();

      console.log('');
      console.log('🎉 Aegis 已启动！');
      console.log('');
      console.log('📊 服务信息:');
      console.log('  🔗 Hook后端: http://localhost:9876');
      console.log('  🌐 Web监控: http://localhost:3001');
      console.log('');
      console.log('📋 常用命令:');
      console.log('  npm run monitor  # 打开监控界面');
      console.log('  npm test         # 测试拦截功能');
      console.log('  npm stop         # 停止服务');
      console.log('');

      // 保存PID
      fs.writeFileSync(this.pidFile, process.pid.toString());

      // 保持进程运行
      console.log('⏱️  服务运行中... (Ctrl+C 停止)');

      // 可选：自动打开监控界面
      if (process.argv.includes('--open')) {
        setTimeout(() => this.openMonitor(), 2000);
      }

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      process.exit(1);
    }
  }

  async checkSetup() {
    console.log('🔍 检查配置...');

    if (!fs.existsSync(this.configFile)) {
      throw new Error('未检测到配置，请先运行: npm run setup');
    }

    try {
      const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      if (!config.installed) {
        throw new Error('配置不完整，请重新运行: npm run setup');
      }
      console.log('✅ 配置检查通过');
    } catch (e) {
      throw new Error('配置文件损坏，请重新运行: npm run setup');
    }
  }

  async startBackendService() {
    console.log('🔧 启动Hook后端服务...');

    const server = http.createServer((req, res) => {
      // CORS设置
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/hook-event' && req.method === 'POST') {
        this.handleHookEvent(req, res);
      } else if (req.url === '/status' && req.method === 'GET') {
        this.handleStatus(req, res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(9876, '127.0.0.1', () => {
      console.log('✅ Hook后端已启动 (端口 9876)');
    });

    this.servers.push(server);
  }

  handleHookEvent(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        console.log(`📡 Hook事件: ${event.type} - ${event.reason}`);

        // 保存事件到文件供Web界面读取
        try {
          fs.appendFileSync(this.eventFile, JSON.stringify(event) + '\n');
        } catch (writeError) {
          console.warn('⚠️ 保存事件失败:', writeError.message);
        }

        // 响应Hook
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, timestamp: new Date().toISOString() }));

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }

  handleStatus(req, res) {
    const status = {
      service: 'aegis-npm',
      status: 'running',
      pid: process.pid,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      ports: { backend: 9876, web: 3001 }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  }

  async startWebInterface() {
    console.log('🌐 启动Web监控界面...');

    const server = http.createServer((req, res) => {
      if (req.url === '/' && req.method === 'GET') {
        this.serveMonitorPage(req, res);
      } else if (req.url === '/api/events' && req.method === 'GET') {
        this.serveEvents(req, res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(3001, '127.0.0.1', () => {
      console.log('✅ Web界面已启动 (端口 3001)');
    });

    this.servers.push(server);
  }

  serveMonitorPage(req, res) {
    const monitorHtml = this.getMonitorHtml();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(monitorHtml);
  }

  serveEvents(req, res) {
    try {
      if (fs.existsSync(this.eventFile)) {
        const data = fs.readFileSync(this.eventFile, 'utf8');
        const events = data.trim().split('\\n')
          .filter(line => line)
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(event => event)
          .slice(-100); // 最近100个事件

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(events));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  getMonitorHtml() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🛡️ Aegis 安全监控 (npm版本)</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #f1f5f9; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #3b82f6; margin-bottom: 10px; }
        .header p { color: #94a3b8; }
        .status-bar { display: flex; justify-content: space-between; align-items: center; background: #1e293b; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; }
        .status-item { display: flex; align-items: center; gap: 8px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
        .controls { margin-bottom: 20px; text-align: center; }
        .btn { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin: 0 5px; transition: background 0.2s; }
        .btn:hover { background: #2563eb; }
        .events-container { background: #1e293b; border-radius: 8px; padding: 20px; max-height: 600px; overflow-y: auto; }
        .event { margin-bottom: 15px; padding: 15px; border-radius: 6px; border-left: 4px solid; }
        .event-blocked { background: rgba(239, 68, 68, 0.1); border-left-color: #ef4444; }
        .event-allowed { background: rgba(16, 185, 129, 0.1); border-left-color: #10b981; }
        .event-header { display: flex; justify-content: between; align-items: center; margin-bottom: 8px; }
        .event-type { font-weight: bold; text-transform: uppercase; font-size: 12px; }
        .event-time { font-size: 12px; opacity: 0.7; margin-left: auto; }
        .event-message { margin-bottom: 8px; }
        .event-command { font-family: 'SF Mono', 'Monaco', monospace; background: rgba(0, 0, 0, 0.3); padding: 8px; border-radius: 4px; font-size: 12px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: #1e293b; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-number { font-size: 28px; font-weight: bold; margin-bottom: 5px; }
        .stat-label { font-size: 14px; opacity: 0.8; }
        .empty-state { text-align: center; padding: 40px; opacity: 0.6; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Aegis 安全监控</h1>
            <p>npm版本 - 实时保护您的AI Agent</p>
        </div>

        <div class="status-bar">
            <div class="status-item">
                <div class="status-dot"></div>
                <span>服务运行中</span>
            </div>
            <div class="status-item">
                <span id="event-count">事件: 0</span>
            </div>
            <div class="status-item">
                <span id="last-update">等待更新...</span>
            </div>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-number" id="blocked-count" style="color: #ef4444;">0</div>
                <div class="stat-label">🛡️ 已拦截</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="allowed-count" style="color: #10b981;">0</div>
                <div class="stat-label">✅ 已允许</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="uptime">00:00</div>
                <div class="stat-label">⏱️ 运行时间</div>
            </div>
        </div>

        <div class="controls">
            <button class="btn" onclick="loadEvents()">🔄 刷新事件</button>
            <button class="btn" onclick="clearEvents()">🗑️ 清空事件</button>
            <button class="btn" onclick="window.open('/api/events')">📊 原始数据</button>
        </div>

        <div class="events-container" id="events">
            <div class="empty-state">📡 加载事件数据...</div>
        </div>
    </div>

    <script>
        let startTime = Date.now();
        let stats = { blocked: 0, allowed: 0 };

        async function loadEvents() {
            try {
                const response = await fetch('/api/events');
                const events = await response.json();

                updateStats(events);
                displayEvents(events);
                updateLastUpdate();

            } catch (error) {
                console.error('加载事件失败:', error);
                document.getElementById('events').innerHTML =
                    '<div class="empty-state">❌ 加载失败，请检查服务状态</div>';
            }
        }

        function updateStats(events) {
            stats = { blocked: 0, allowed: 0 };
            events.forEach(event => {
                if (event.type === 'blocked') stats.blocked++;
                else if (event.type === 'allowed') stats.allowed++;
            });

            document.getElementById('blocked-count').textContent = stats.blocked;
            document.getElementById('allowed-count').textContent = stats.allowed;
            document.getElementById('event-count').textContent = \`事件: \${events.length}\`;
        }

        function displayEvents(events) {
            const container = document.getElementById('events');

            if (events.length === 0) {
                container.innerHTML = '<div class="empty-state">📝 暂无安全事件</div>';
                return;
            }

            const recentEvents = events.slice(-20).reverse(); // 最近20个，新的在前

            container.innerHTML = recentEvents.map(event => \`
                <div class="event event-\${event.type}">
                    <div class="event-header">
                        <span class="event-type">\${getEventIcon(event.type)} \${event.type}</span>
                        <span class="event-time">\${new Date(event.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="event-message">\${event.reason}</div>
                    <div class="event-command">命令: \${event.command}</div>
                </div>
            \`).join('');
        }

        function getEventIcon(type) {
            const icons = { blocked: '🛡️', allowed: '✅', warning: '⚠️' };
            return icons[type] || '📝';
        }

        function updateLastUpdate() {
            document.getElementById('last-update').textContent =
                \`最后更新: \${new Date().toLocaleTimeString()}\`;
        }

        function updateUptime() {
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(uptime / 60);
            const seconds = uptime % 60;
            document.getElementById('uptime').textContent =
                \`\${minutes.toString().padStart(2, '0')}:\${seconds.toString().padStart(2, '0')}\`;
        }

        function clearEvents() {
            if (confirm('确定要清空所有事件记录吗？')) {
                // 这里可以调用清空API
                console.log('清空事件功能待实现');
            }
        }

        // 自动刷新
        setInterval(loadEvents, 5000);
        setInterval(updateUptime, 1000);

        // 初始加载
        loadEvents();
    </script>
</body>
</html>`;
  }

  async openMonitor() {
    const { execSync } = require('child_process');
    const url = 'http://localhost:3001';

    try {
      const command = process.platform === 'win32' ? 'start' :
                     process.platform === 'darwin' ? 'open' : 'xdg-open';
      execSync(`${command} ${url}`, { stdio: 'ignore' });
      console.log('🌐 已打开监控界面');
    } catch (error) {
      console.log('💡 请手动打开:', url);
    }
  }

  registerShutdownHandlers() {
    console.log('📝 注册关闭处理器...');

    const cleanup = () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log('\\n🛑 正在关闭Aegis服务...');

      // 关闭所有服务器
      this.servers.forEach(server => {
        try {
          server.close();
        } catch (e) {
          // 静默处理关闭错误
        }
      });

      // 删除PID文件
      try {
        if (fs.existsSync(this.pidFile)) {
          fs.unlinkSync(this.pidFile);
        }
      } catch (e) {
        // 静默处理文件删除错误
      }

      console.log('✅ Aegis 已安全关闭');
      process.exit(0);
    };

    process.on('SIGINT', cleanup);   // Ctrl+C
    process.on('SIGTERM', cleanup);  // Kill signal
    process.on('SIGUSR1', cleanup);  // nodemon restart
    process.on('SIGUSR2', cleanup);  // nodemon restart

    console.log('✅ 关闭处理器已注册');
  }
}

// 启动服务
if (require.main === module) {
  const starter = new AegisNpmStart();
  starter.run();
}

module.exports = AegisNpmStart;