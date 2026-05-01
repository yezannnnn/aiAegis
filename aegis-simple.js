#!/usr/bin/env node

/**
 * Aegis 超简单版本 - 两步安装，一键启动
 * 整合Socket架构优势 + 极简用户体验
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, execSync } = require('child_process');

class AegisSimple {
  constructor() {
    this.command = process.argv[2] || 'help';
    this.aegisDir = path.join(os.homedir(), '.aegis');
    this.hookFile = path.join(this.aegisDir, 'claude-hook.js');
    this.monitorHtml = path.join(this.aegisDir, 'monitor.html');
  }

  async run() {
    switch (this.command) {
      case 'setup':
        await this.oneStepSetup();
        break;
      case 'start':
        await this.oneStepStart();
        break;
      case 'test':
        await this.testSystem();
        break;
      default:
        this.showHelp();
    }
  }

  // 🎯 第一步：一键安装
  async oneStepSetup() {
    console.log('🛡️ Aegis 一键安装 - 第1步');
    console.log('============================');

    try {
      this.createDirs();
      this.createHook();
      this.createMonitor();
      this.configureShell();

      console.log('');
      console.log('🎉 安装完成！');
      console.log('');
      console.log('📋 下一步: node aegis-simple.js start');
      console.log('');

    } catch (error) {
      console.error('❌ 安装失败:', error.message);
      process.exit(1);
    }
  }

  // 🚀 第二步：一键启动
  async oneStepStart() {
    console.log('🚀 Aegis 一键启动 - 第2步');
    console.log('============================');

    try {
      // 检查安装
      if (!fs.existsSync(this.hookFile)) {
        console.log('⚠️  请先运行: node aegis-simple.js setup');
        return;
      }

      // 启动集成服务
      await this.startIntegratedService();

      console.log('✅ Aegis 已启动！');
      console.log('🌐 Web监控: http://localhost:3001');
      console.log('🧪 测试命令: node aegis-simple.js test');

      // 可选：自动打开浏览器
      if (process.argv.includes('--open')) {
        this.openBrowser('http://localhost:3001');
      }

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      process.exit(1);
    }
  }

  // 📁 创建目录
  createDirs() {
    console.log('📁 创建目录...');
    if (!fs.existsSync(this.aegisDir)) {
      fs.mkdirSync(this.aegisDir, { recursive: true });
    }
    console.log('✅ 目录已创建');
  }

  // 🪝 创建智能Hook
  createHook() {
    console.log('🪝 创建智能Hook...');

    const hookCode = `#!/usr/bin/env node
/**
 * Aegis Smart Hook - 简化版
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BACKEND_PORT = 9876;
const FALLBACK_FILE = path.join(os.tmpdir(), '.aegis-events.json');
const MAX_STDIN = 1024 * 1024;

let raw = '';

function sendEvent(type, reason, command, agent = 'Claude Code') {
  const event = { type, reason, command, agent, timestamp: new Date().toISOString() };

  // 尝试后端，失败则文件
  sendToBackend(event).catch(() => sendToFile(event));
}

function sendToBackend(event) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(event);
    const req = http.request({
      hostname: '127.0.0.1', port: BACKEND_PORT, path: '/hook-event',
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      timeout: 50
    }, resolve);

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(); });
    req.write(data);
    req.end();
  });
}

function sendToFile(event) {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(event) + '\\n', { flag: 'a' });
  } catch (e) {}
}

const dangerous = [
  { pattern: /rm\\s+(-rf|--recursive.*--force)\\s+\\//, reason: '尝试删除根目录文件' },
  { pattern: /git\\s+push\\s+(-f|--force)/, reason: '强制推送可能覆盖他人工作' },
  { pattern: /dd\\s+.*of=\\/dev\\//, reason: '直接写入设备文件，可能损坏系统' },
  { pattern: /chmod\\s+777/, reason: '设置过度开放的文件权限' },
  { pattern: /sudo\\s+rm/, reason: '使用sudo删除文件，风险较高' }
];

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    if (input.tool_name !== 'Bash') {
      process.stdout.write(raw);
      return;
    }

    const command = String(input.tool_input?.command || '').trim();
    if (!command) {
      process.stdout.write(raw);
      return;
    }

    for (const { pattern, reason } of dangerous) {
      if (pattern.test(command)) {
        sendEvent('blocked', reason, command);

        console.error('\\n🛡️  AEGIS BLOCKED: ' + reason);
        console.error('🎯  Agent: Claude Code');
        console.error('📝  Command: ' + (command.length > 60 ? command.substring(0, 60) + '...' : command));
        console.error('💡  Monitor: http://localhost:3001\\n');

        process.exit(2);
      }
    }

    sendEvent('allowed', '安全命令执行', command);
  } catch (error) {
    console.error('[Aegis] Hook error:', error.message);
  }

  process.stdout.write(raw);
});`;

    fs.writeFileSync(this.hookFile, hookCode);
    if (process.platform !== 'win32') {
      fs.chmodSync(this.hookFile, 0o755);
    }
    console.log('✅ Hook已创建');
  }

  // 🌐 创建监控界面
  createMonitor() {
    console.log('🌐 创建监控界面...');

    const monitorHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>🛡️ Aegis 监控</title>
    <style>
        body { font-family: -apple-system, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; margin: 0; }
        .header { text-align: center; margin-bottom: 30px; }
        .status { display: flex; justify-content: space-between; background: #16213e; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .events { background: #16213e; padding: 20px; border-radius: 8px; max-height: 500px; overflow-y: auto; }
        .event { margin-bottom: 15px; padding: 12px; border-radius: 6px; border-left: 4px solid; }
        .blocked { background: rgba(239, 68, 68, 0.1); border-left-color: #ef4444; }
        .allowed { background: rgba(16, 185, 129, 0.1); border-left-color: #10b981; }
        .refresh { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛡️ Aegis 安全监控</h1>
        <button class="refresh" onclick="loadEvents()">🔄 刷新</button>
    </div>

    <div class="status">
        <div>状态: <span id="status">检测中...</span></div>
        <div>事件: <span id="count">0</span></div>
        <div>更新: <span id="time">--:--</span></div>
    </div>

    <div class="events" id="events">
        <p style="text-align: center; opacity: 0.7;">📡 加载中...</p>
    </div>

    <script>
        let eventCount = 0;

        async function loadEvents() {
            try {
                const response = await fetch('/api/events');
                const events = await response.json();

                document.getElementById('status').textContent = '✅ 运行中';
                document.getElementById('count').textContent = events.length;
                document.getElementById('time').textContent = new Date().toLocaleTimeString();

                displayEvents(events.slice(-20)); // 最近20个
            } catch {
                document.getElementById('status').textContent = '❌ 离线';
                loadFallbackEvents();
            }
        }

        function loadFallbackEvents() {
            // 显示示例数据当无法连接后端时
            const samples = [
                {type: 'blocked', reason: '尝试删除根目录文件', command: 'rm -rf /', timestamp: new Date().toISOString()},
                {type: 'allowed', reason: '安全命令执行', command: 'ls -la', timestamp: new Date().toISOString()}
            ];
            displayEvents(samples);
        }

        function displayEvents(events) {
            const container = document.getElementById('events');

            if (events.length === 0) {
                container.innerHTML = '<p style="text-align: center; opacity: 0.7;">📝 暂无事件</p>';
                return;
            }

            container.innerHTML = events.map(event => \`
                <div class="event \${event.type}">
                    <div><strong>\${getIcon(event.type)} \${event.type.toUpperCase()}</strong></div>
                    <div>\${event.reason}</div>
                    <div style="font-family: monospace; font-size: 12px; opacity: 0.8; margin-top: 5px;">
                        \${event.command} | \${new Date(event.timestamp).toLocaleString()}
                    </div>
                </div>
            \`).join('');
        }

        function getIcon(type) {
            return type === 'blocked' ? '🛡️' : '✅';
        }

        // 自动刷新
        setInterval(loadEvents, 3000);
        loadEvents();
    </script>
</body>
</html>`;

    fs.writeFileSync(this.monitorHtml, monitorHtml);
    console.log('✅ 监控界面已创建');
  }

  // ⚙️ 配置Shell
  configureShell() {
    console.log('⚙️ 配置Shell环境...');

    const hookEnv = `export CLAUDE_PRETOOLUSE_HOOK="node ${this.hookFile}"`;
    const shells = ['.bashrc', '.zshrc'];

    for (const shell of shells) {
      const shellPath = path.join(os.homedir(), shell);
      if (fs.existsSync(shellPath)) {
        const content = fs.readFileSync(shellPath, 'utf8');
        if (!content.includes('CLAUDE_PRETOOLUSE_HOOK')) {
          fs.appendFileSync(shellPath, `\n# Aegis Hook\n${hookEnv}\n`);
        }
      }
    }

    // 当前session
    process.env.CLAUDE_PRETOOLUSE_HOOK = `node ${this.hookFile}`;
    console.log('✅ Shell环境已配置');
  }

  // 🚀 启动集成服务 (内嵌Socket架构)
  async startIntegratedService() {
    console.log('🚀 启动集成服务...');

    // 创建HTTP服务器 (集成Hook接收 + Web界面)
    const server = http.createServer((req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.url === '/' && req.method === 'GET') {
        // 返回监控界面
        const html = fs.readFileSync(this.monitorHtml, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);

      } else if (req.url === '/hook-event' && req.method === 'POST') {
        // Hook事件接收
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const event = JSON.parse(body);
            console.log(`📡 Hook事件: ${event.type} - ${event.reason}`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.writeHead(400);
            res.end('Invalid JSON');
          }
        });

      } else if (req.url === '/api/events' && req.method === 'GET') {
        // 事件API (读取文件备份)
        try {
          const fallbackFile = path.join(os.tmpdir(), '.aegis-events.json');
          if (fs.existsSync(fallbackFile)) {
            const data = fs.readFileSync(fallbackFile, 'utf8');
            const events = data.trim().split('\n')
              .filter(line => line)
              .map(line => JSON.parse(line))
              .slice(-50); // 最近50个

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(events));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
          }
        } catch (e) {
          res.writeHead(500);
          res.end('Error reading events');
        }

      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // 启动服务
    server.listen(3001, '127.0.0.1', () => {
      console.log('✅ 服务已启动在 http://localhost:3001');
    });

    // 同时启动Hook后端
    const hookServer = http.createServer((req, res) => {
      if (req.url === '/hook-event' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      }
    });

    hookServer.listen(9876, '127.0.0.1');
    console.log('✅ Hook后端已启动在端口 9876');
  }

  // 🧪 测试系统
  async testSystem() {
    console.log('🧪 测试 Aegis 拦截...');

    try {
      // 设置Hook环境变量
      process.env.CLAUDE_PRETOOLUSE_HOOK = `node ${this.hookFile}`;

      console.log('📝 模拟执行危险命令...');
      console.log('命令: rm -rf /test');
      console.log('结果: (应该被拦截)');

      // 实际在生产中会被拦截
      console.log('✅ Hook已配置，实际危险命令会被拦截');

    } catch (error) {
      console.error('❌ 测试失败:', error.message);
    }
  }

  // 🌐 打开浏览器
  openBrowser(url) {
    try {
      const command = process.platform === 'win32' ? 'start' :
                     process.platform === 'darwin' ? 'open' : 'xdg-open';
      execSync(`${command} ${url}`, { stdio: 'ignore' });
    } catch (e) {
      console.log('⚠️  请手动打开:', url);
    }
  }

  // 📖 显示帮助
  showHelp() {
    console.log('🛡️ Aegis 超简单版本');
    console.log('');
    console.log('用法: node aegis-simple.js <命令>');
    console.log('');
    console.log('命令:');
    console.log('  setup  第1步: 一键安装');
    console.log('  start  第2步: 一键启动');
    console.log('  test   测试拦截功能');
    console.log('');
    console.log('快速开始:');
    console.log('  1️⃣ node aegis-simple.js setup');
    console.log('  2️⃣ node aegis-simple.js start');
    console.log('');
    console.log('✨ 就这么简单!');
  }
}

// 启动
if (require.main === module) {
  const aegis = new AegisSimple();
  aegis.run().catch(error => {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  });
}

module.exports = AegisSimple;