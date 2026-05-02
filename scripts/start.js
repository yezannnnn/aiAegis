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
    try {
      // 使用我们的 Dark Minimal UI
      const uiPath = path.join(__dirname, '..', 'monitor-ui.html');
      if (fs.existsSync(uiPath)) {
        return fs.readFileSync(uiPath, 'utf8');
      }
    } catch (error) {
      console.log('⚠️ 无法加载 Dark Minimal UI，使用备用界面');
    }

    // 备用的简化界面
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🛡️ Aegis 安全监控 (备用界面)</title>
    <style>
        body {
            font-family: monospace;
            background: #0f172a;
            color: #f1f5f9;
            padding: 20px;
            text-align: center;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 40px;
            border: 1px solid #334155;
        }
        h1 { color: #3b82f6; margin-bottom: 20px; }
        .note { opacity: 0.7; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🛡️ Aegis 安全监控</h1>
        <p>Dark Minimal UI 加载失败，使用备用界面</p>
        <p class="note">请检查 monitor-ui.html 文件是否存在</p>
        <p class="note">推荐使用: <code>node real-time-monitor.js</code></p>
    </div>
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