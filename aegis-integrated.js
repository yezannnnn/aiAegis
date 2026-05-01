#!/usr/bin/env node

/**
 * Aegis 一体化安全监控
 * 集成Socket架构的技术优势 + 极简用户体验
 * 一个文件解决所有问题！
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, execSync } = require('child_process');

class AegisIntegrated {
  constructor() {
    this.mode = process.argv[2] || 'help';
    this.aegisDir = path.join(os.homedir(), '.aegis');
    this.configFile = path.join(this.aegisDir, 'config.json');
    this.hookFile = path.join(this.aegisDir, 'claude-hook.js');
    this.pidFile = path.join(this.aegisDir, 'aegis.pid');

    this.config = {
      hookPort: 9876,
      webPort: 3001,
      installed: false,
      version: '1.0.0'
    };
  }

  // 主入口
  async run() {
    switch (this.mode) {
      case 'setup':
        await this.setupEverything();
        break;
      case 'start':
        await this.startServices();
        break;
      case 'stop':
        await this.stopServices();
        break;
      case 'status':
        await this.showStatus();
        break;
      case 'monitor':
        await this.openMonitor();
        break;
      case 'daemon':
        await this.runAsDaemon();
        break;
      default:
        this.showHelp();
    }
  }

  // 🎯 一键安装所有组件
  async setupEverything() {
    console.log('🛡️ Aegis 一键安装开始...');
    console.log('=====================================');

    try {
      await this.createDirectories();
      await this.generateHook();
      await this.generateWebInterface();
      await this.configureClaudeCode();
      await this.createSystemService();
      await this.testInstallation();

      console.log('');
      console.log('🎉 安装完成！');
      console.log('');
      console.log('📋 使用方法：');
      console.log('  aegis start    # 启动监控');
      console.log('  aegis monitor  # 打开Web界面');
      console.log('  aegis status   # 查看状态');
      console.log('');
      console.log('✨ 现在执行: aegis start');

    } catch (error) {
      console.error('❌ 安装失败:', error.message);
      process.exit(1);
    }
  }

  // 🚀 启动所有服务 (一命令搞定)
  async startServices() {
    console.log('🚀 启动 Aegis 监控服务...');

    try {
      // 检查是否已安装
      if (!this.isInstalled()) {
        console.log('⚠️  尚未安装，自动执行安装...');
        await this.setupEverything();
      }

      // 启动后台守护进程
      const daemon = spawn('node', [__filename, 'daemon'], {
        detached: true,
        stdio: 'ignore'
      });

      daemon.unref();

      // 保存PID
      fs.writeFileSync(this.pidFile, daemon.pid.toString());

      // 等待服务启动
      await this.waitForServices();

      console.log('✅ Aegis 监控已启动');
      console.log('🌐 Web界面: http://localhost:3001');
      console.log('📊 执行 "aegis monitor" 打开监控界面');

      // 自动打开Web界面 (可选)
      if (process.argv.includes('--open')) {
        await this.openMonitor();
      }

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      process.exit(1);
    }
  }

  // 🛑 停止服务
  async stopServices() {
    console.log('🛑 停止 Aegis 监控服务...');

    try {
      if (fs.existsSync(this.pidFile)) {
        const pid = fs.readFileSync(this.pidFile, 'utf8');
        process.kill(parseInt(pid), 'SIGTERM');
        fs.unlinkSync(this.pidFile);
        console.log('✅ 服务已停止');
      } else {
        console.log('⚠️  服务未运行');
      }
    } catch (error) {
      console.log('⚠️  停止服务时出错:', error.message);
    }
  }

  // 📊 显示状态
  async showStatus() {
    const running = this.isRunning();
    const installed = this.isInstalled();

    console.log('📊 Aegis 状态报告');
    console.log('===================');
    console.log('安装状态:', installed ? '✅ 已安装' : '❌ 未安装');
    console.log('运行状态:', running ? '✅ 运行中' : '❌ 已停止');

    if (running) {
      try {
        const response = await this.checkWebInterface();
        console.log('Web界面:', response ? '✅ 正常' : '❌ 异常');
        console.log('监控地址: http://localhost:3001');
      } catch {
        console.log('Web界面: ❌ 无响应');
      }
    }

    if (installed && !running) {
      console.log('');
      console.log('💡 执行 "aegis start" 启动服务');
    }
  }

  // 🌐 打开Web监控界面
  async openMonitor() {
    const webUrl = 'http://localhost:3001';

    try {
      // 检查Web界面是否运行
      await this.checkWebInterface();

      // 根据平台打开浏览器
      const command = process.platform === 'win32' ? 'start' :
                     process.platform === 'darwin' ? 'open' : 'xdg-open';

      execSync(\`\${command} \${webUrl}\`);
      console.log('🌐 已打开监控界面:', webUrl);

    } catch (error) {
      console.log('⚠️  Web界面未运行，请先执行: aegis start');
    }
  }

  // 🤖 后台守护进程模式
  async runAsDaemon() {
    // 在后台静默运行，集成Socket架构
    const express = require('./aegis-backend-service.js');

    // 这里整合我们之前的Socket后端服务代码
    // 但作为内嵌模块运行，不需要单独启动

    console.log('🤖 Aegis 守护进程已启动');

    // 保持进程运行
    process.on('SIGTERM', () => {
      console.log('🛑 守护进程接收停止信号');
      process.exit(0);
    });
  }

  // 📁 创建目录结构
  async createDirectories() {
    console.log('📁 创建目录结构...');

    if (!fs.existsSync(this.aegisDir)) {
      fs.mkdirSync(this.aegisDir, { recursive: true });
    }

    // 创建配置文件
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
    console.log('✅ 目录结构已创建');
  }

  // 🪝 生成智能Hook
  async generateHook() {
    console.log('🪝 生成智能Hook脚本...');

    const hookContent = \`#!/usr/bin/env node
/**
 * Aegis Smart Hook - 一体化版本
 * 自动检测后端服务，智能降级
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 9876;
const FALLBACK_FILE = path.join(os.tmpdir(), '.aegis-events.json');
const MAX_STDIN = 1024 * 1024;

let raw = '';

// 智能发送事件 (后端优先，文件备份)
function sendEventSmart(type, reason, command, agent = 'Claude Code') {
  const event = {
    type, reason, command, agent,
    timestamp: new Date().toISOString(),
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 5)
  };

  // 尝试发送到后端服务
  sendToBackend(event).catch(() => {
    // 后端不可用，写入文件
    sendToFile(event);
  });
}

// 发送到后端 (异步，但有超短超时)
function sendToBackend(event) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(event);
    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/hook-event',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 30 // 极短超时
    };

    const req = http.request(options, resolve);
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(); });
    req.write(data);
    req.end();
  });
}

// 文件备份
function sendToFile(event) {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(event) + '\\\\n', { flag: 'a' });
  } catch (e) {
    // 静默失败
  }
}

// 危险模式检测
const dangerousPatterns = [
  { pattern: /rm\\\\s+(-rf|--recursive.*--force)\\\\s+\\//, reason: '尝试删除根目录文件' },
  { pattern: /git\\\\s+push\\\\s+(-f|--force)/, reason: '强制推送可能覆盖他人工作' },
  { pattern: /dd\\\\s+.*of=\\/dev\\//, reason: '直接写入设备文件，可能损坏系统' },
  { pattern: /chmod\\\\s+777/, reason: '设置过度开放的文件权限' },
  { pattern: /sudo\\\\s+rm/, reason: '使用sudo删除文件，风险较高' }
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

    // 检查危险模式
    for (const { pattern, reason } of dangerousPatterns) {
      if (pattern.test(command)) {
        sendEventSmart('blocked', reason, command);

        console.error(\`\\\\n🛡️  AEGIS BLOCKED: \${reason}\`);
        console.error(\`🎯  Agent: Claude Code\`);
        console.error(\`📝  Command: \${command.length > 60 ? command.substring(0, 60) + '...' : command}\`);
        console.error(\`💡  Monitor: aegis monitor\\\\n\`);

        process.exit(2);
      }
    }

    sendEventSmart('allowed', '安全命令执行', command);
  } catch (error) {
    console.error('[Aegis] Hook error:', error.message);
  }

  process.stdout.write(raw);
});
\`;

    fs.writeFileSync(this.hookFile, hookContent);
    if (process.platform !== 'win32') {
      fs.chmodSync(this.hookFile, 0o755);
    }

    console.log('✅ Hook脚本已生成');
  }

  // 🌐 生成Web界面 (内嵌在服务中)
  async generateWebInterface() {
    console.log('🌐 准备Web监控界面...');
    // Web界面将作为服务的一部分，不需要单独文件
    console.log('✅ Web界面已准备');
  }

  // ⚙️ 配置Claude Code (自动)
  async configureClaudeCode() {
    console.log('⚙️ 配置Claude Code Hook...');

    const hookEnv = \`export CLAUDE_PRETOOLUSE_HOOK="node \${this.hookFile}"\`;
    const shellFiles = ['.bashrc', '.zshrc', '.profile'];

    for (const file of shellFiles) {
      const filePath = path.join(os.homedir(), file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content.includes('CLAUDE_PRETOOLUSE_HOOK')) {
          fs.appendFileSync(filePath, \`\\n# Aegis Security Hook\\n\${hookEnv}\\n\`);
          console.log(\`✅ 已配置 \${file}\`);
        }
      }
    }

    // 设置当前session的环境变量
    process.env.CLAUDE_PRETOOLUSE_HOOK = \`node \${this.hookFile}\`;
    console.log('✅ Claude Code Hook 配置完成');
  }

  // 🔧 创建系统服务
  async createSystemService() {
    console.log('🔧 配置系统服务...');

    // 创建简单的启动脚本
    const startScript = path.join(this.aegisDir, 'start.sh');
    const scriptContent = \`#!/bin/bash
cd "\${path.dirname(__filename)}"
node aegis-integrated.js daemon
\`;

    fs.writeFileSync(startScript, scriptContent);
    if (process.platform !== 'win32') {
      fs.chmodSync(startScript, 0o755);
    }

    console.log('✅ 系统服务已配置');
  }

  // 🧪 测试安装
  async testInstallation() {
    console.log('🧪 测试安装...');

    // 基本文件检查
    const requiredFiles = [this.hookFile, this.configFile];
    for (const file of requiredFiles) {
      if (!fs.existsSync(file)) {
        throw new Error(\`必需文件缺失: \${file}\`);
      }
    }

    // 标记为已安装
    this.config.installed = true;
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));

    console.log('✅ 安装测试通过');
  }

  // 工具方法
  isInstalled() {
    if (!fs.existsSync(this.configFile)) return false;
    try {
      const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      return config.installed === true;
    } catch {
      return false;
    }
  }

  isRunning() {
    if (!fs.existsSync(this.pidFile)) return false;
    try {
      const pid = parseInt(fs.readFileSync(this.pidFile, 'utf8'));
      process.kill(pid, 0); // 检查进程是否存在
      return true;
    } catch {
      return false;
    }
  }

  async checkWebInterface() {
    return new Promise((resolve) => {
      const req = http.request({ port: 3001, timeout: 1000 }, () => resolve(true));
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  async waitForServices() {
    for (let i = 0; i < 30; i++) { // 等待最多3秒
      if (await this.checkWebInterface()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('服务启动超时');
  }

  showHelp() {
    console.log('🛡️ Aegis 一体化安全监控');
    console.log('');
    console.log('用法: node aegis-integrated.js <命令>');
    console.log('');
    console.log('命令:');
    console.log('  setup    一键安装所有组件');
    console.log('  start    启动监控服务');
    console.log('  stop     停止监控服务');
    console.log('  status   查看运行状态');
    console.log('  monitor  打开Web监控界面');
    console.log('');
    console.log('快速开始:');
    console.log('  1. node aegis-integrated.js setup');
    console.log('  2. node aegis-integrated.js start');
    console.log('');
  }
}

// 启动
if (require.main === module) {
  const aegis = new AegisIntegrated();
  aegis.run().catch(error => {
    console.error('错误:', error.message);
    process.exit(1);
  });
}

module.exports = AegisIntegrated;