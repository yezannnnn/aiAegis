#!/usr/bin/env node

/**
 * Aegis Setup Script - npm run setup
 * 一键配置所有安全组件
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class AegisNpmSetup {
  constructor() {
    this.aegisDir = path.join(os.homedir(), '.aegis');
    this.hookFile = path.join(this.aegisDir, 'claude-hook.js');
    this.configFile = path.join(this.aegisDir, 'config.json');
  }

  async run() {
    console.log('🛡️ Aegis 一键配置');
    console.log('===================');
    console.log('');

    try {
      this.createDirectories();
      this.installHook();
      this.configureShell();
      this.createConfig();

      console.log('');
      console.log('🎉 配置完成！');
      console.log('');
      console.log('📋 下一步:');
      console.log('  npm start      # 启动监控');
      console.log('  npm run monitor # 打开Web界面');
      console.log('  npm test        # 测试拦截');
      console.log('');

    } catch (error) {
      console.error('❌ 配置失败:', error.message);
      process.exit(1);
    }
  }

  createDirectories() {
    console.log('📁 创建目录结构...');
    if (!fs.existsSync(this.aegisDir)) {
      fs.mkdirSync(this.aegisDir, { recursive: true });
    }
    console.log('✅ 目录已创建');
  }

  installHook() {
    console.log('🪝 安装智能Hook...');

    const hookTemplate = this.getHookTemplate();
    fs.writeFileSync(this.hookFile, hookTemplate);

    if (process.platform !== 'win32') {
      fs.chmodSync(this.hookFile, 0o755);
    }

    console.log('✅ Hook已安装');
  }

  getHookTemplate() {
    return `#!/usr/bin/env node
/**
 * Aegis Smart Hook - npm version
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
  const event = {
    type, reason, command, agent,
    timestamp: new Date().toISOString(),
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 5)
  };

  // 双重保障：后端优先，文件备份
  sendToBackend(event).catch(() => sendToFile(event));
}

function sendToBackend(event) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(event);
    const options = {
      hostname: '127.0.0.1',
      port: BACKEND_PORT,
      path: '/hook-event',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 50 // 极短超时，快速失败
    };

    const req = http.request(options, resolve);
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });

    req.write(data);
    req.end();
  });
}

function sendToFile(event) {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(event) + '\\n', { flag: 'a' });
  } catch (e) {
    // 静默失败，不影响主要拦截功能
  }
}

// 危险命令模式
const dangerousPatterns = [
  { pattern: /rm\\s+(-rf|--recursive.*--force)\\s+\\//, reason: '尝试删除根目录文件' },
  { pattern: /git\\s+push\\s+(-f|--force)/, reason: '强制推送可能覆盖他人工作' },
  { pattern: /dd\\s+.*of=\\/dev\\//, reason: '直接写入设备文件，可能损坏系统' },
  { pattern: /chmod\\s+777/, reason: '设置过度开放的文件权限' },
  { pattern: /sudo\\s+rm/, reason: '使用sudo删除文件，风险较高' }
];

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length < MAX_STDIN) {
    raw += chunk.substring(0, MAX_STDIN - raw.length);
  }
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);

    // 只处理Bash命令
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
        // 记录事件
        sendEvent('blocked', reason, command);

        // 显示拦截信息
        console.error('\\n🛡️  AEGIS BLOCKED: ' + reason);
        console.error('🎯  Agent: Claude Code');
        console.error('📝  Command: ' + (command.length > 60 ? command.substring(0, 60) + '...' : command));
        console.error('💡  Monitor: http://localhost:3001\\n');

        process.exit(2);
      }
    }

    // 记录允许的命令
    sendEvent('allowed', '安全命令执行', command);

  } catch (error) {
    console.error('[Aegis] Hook error:', error.message);
  }

  process.stdout.write(raw);
});`;
  }

  configureShell() {
    console.log('⚙️ 配置Shell环境...');

    const hookEnv = `export CLAUDE_PRETOOLUSE_HOOK="node ${this.hookFile}"`;
    const shells = ['.bashrc', '.zshrc', '.profile'];

    let configured = false;

    for (const shell of shells) {
      const shellPath = path.join(os.homedir(), shell);
      if (fs.existsSync(shellPath)) {
        const content = fs.readFileSync(shellPath, 'utf8');
        if (!content.includes('CLAUDE_PRETOOLUSE_HOOK')) {
          fs.appendFileSync(shellPath, `\n# Aegis Security Hook (npm version)\n${hookEnv}\n`);
          console.log(`✅ 已配置 ${shell}`);
          configured = true;
        } else {
          console.log(`✅ ${shell} 已配置`);
          configured = true;
        }
      }
    }

    if (!configured) {
      console.log('⚠️  请手动添加到您的shell配置文件:');
      console.log(`   ${hookEnv}`);
    }

    // 当前session环境变量
    process.env.CLAUDE_PRETOOLUSE_HOOK = `node ${this.hookFile}`;
    console.log('✅ Shell环境配置完成');
  }

  createConfig() {
    console.log('📝 创建配置文件...');

    const config = {
      version: '2.0.0',
      installed: true,
      installedAt: new Date().toISOString(),
      hooks: {
        claudeCode: this.hookFile
      },
      ports: {
        backend: 9876,
        web: 3001
      },
      features: {
        realTimeMonitoring: true,
        fileBackup: true,
        webInterface: true
      }
    };

    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    console.log('✅ 配置文件已创建');
  }
}

// 运行安装
if (require.main === module) {
  const setup = new AegisNpmSetup();
  setup.run();
}

module.exports = AegisNpmSetup;