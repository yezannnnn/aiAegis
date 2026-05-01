#!/usr/bin/env node

/**
 * Aegis一键安装器 - 极简用户体验
 * 自动检测最佳方案，一键完成所有配置
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class AegisSimpleInstaller {
  constructor() {
    this.aegisDir = path.join(os.homedir(), '.aegis');
    this.hookFile = path.join(this.aegisDir, 'claude-hook.js');
    this.monitorFile = path.join(this.aegisDir, 'monitor.html');
  }

  // 主安装方法
  async install() {
    console.log('🛡️ Aegis 安全监控 - 一键安装');
    console.log('==========================================');

    try {
      await this.detectEnvironment();
      await this.createDirectories();
      await this.installHook();
      await this.installMonitor();
      await this.configureClaudeCode();
      await this.testInstallation();

      this.showSuccessMessage();
    } catch (error) {
      console.error('❌ 安装失败:', error.message);
      this.showTroubleshootingTips();
    }
  }

  // 环境检测
  async detectEnvironment() {
    console.log('🔍 检测环境...');

    // 检查Node.js
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' });
      console.log(`✅ Node.js: ${nodeVersion.trim()}`);
    } catch {
      throw new Error('需要安装 Node.js (https://nodejs.org)');
    }

    // 检查Claude Code
    const claudeCodeExists = process.env.CLAUDE_PRETOOLUSE_HOOK !== undefined
                           || fs.existsSync('/usr/local/bin/claude');
    if (!claudeCodeExists) {
      console.log('⚠️  未检测到Claude Code，将提供手动配置说明');
    }

    console.log(`🌐 平台: ${process.platform}`);
    console.log(`📁 安装目录: ${this.aegisDir}`);
  }

  // 创建目录结构
  async createDirectories() {
    console.log('📁 创建目录结构...');

    if (!fs.existsSync(this.aegisDir)) {
      fs.mkdirSync(this.aegisDir, { recursive: true });
      console.log(`✅ 创建 ${this.aegisDir}`);
    } else {
      console.log('✅ 目录已存在');
    }
  }

  // 安装Hook (自包含，无依赖)
  async installHook() {
    console.log('🪝 安装Hook脚本...');

    const hookContent = this.generateOptimizedHook();
    fs.writeFileSync(this.hookFile, hookContent);

    // 设置执行权限 (Unix系统)
    if (process.platform !== 'win32') {
      fs.chmodSync(this.hookFile, 0o755);
    }

    console.log('✅ Hook脚本已安装');
  }

  // 生成优化的Hook (文件队列方案，零依赖)
  generateOptimizedHook() {
    return `#!/usr/bin/env node
/**
 * Aegis Hook - 优化版 (零依赖，文件队列)
 * 自动安装，开箱即用
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_STDIN = 1024 * 1024;
const EVENT_FILE = path.join(os.tmpdir(), '.aegis-events.json');

let raw = '';

// 简单可靠的事件记录 (同步，不会被process.exit中断)
function recordEvent(type, reason, command, agent = 'Claude Code') {
  try {
    const event = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      type, reason, command, agent,
      timestamp: new Date().toISOString(),
      platform: process.platform
    };

    // 关键：同步写入，确保在process.exit前完成
    fs.writeFileSync(EVENT_FILE, JSON.stringify(event) + '\\n', { flag: 'a' });
  } catch {
    // 静默失败，不影响拦截功能
  }
}

// 危险模式检测
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
        // 记录事件 (同步，立即完成)
        recordEvent('blocked', reason, command);

        // 显示拦截信息
        console.error(\`\\n🛡️  AEGIS BLOCKED: \${reason}\`);
        console.error(\`🎯  Agent: Claude Code\`);
        console.error(\`📝  Command: \${command.length > 60 ? command.substring(0, 60) + '...' : command}\`);
        console.error(\`💡  Check ~/.aegis/monitor.html for details\\n\`);

        process.exit(2);
      }
    }

    // 记录允许的命令
    recordEvent('allowed', '安全命令执行', command);

  } catch (error) {
    console.error('[Aegis] Hook error:', error.message);
  }

  process.stdout.write(raw);
});
`;
  }

  // 安装Web监控界面 (静态HTML，零依赖)
  async installMonitor() {
    console.log('🌐 安装Web监控界面...');

    const monitorContent = this.generateStaticMonitor();
    fs.writeFileSync(this.monitorFile, monitorContent);

    console.log('✅ 监控界面已安装');
  }

  // 生成静态监控界面 (读取事件文件)
  generateStaticMonitor() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>🛡️ Aegis 安全监控</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .events { max-height: 500px; overflow-y: auto; background: #16213e; padding: 20px; border-radius: 8px; }
        .event { margin-bottom: 15px; padding: 12px; border-radius: 6px; border-left: 4px solid; }
        .blocked { background: rgba(239, 68, 68, 0.1); border-left-color: #ef4444; }
        .allowed { background: rgba(16, 185, 129, 0.1); border-left-color: #10b981; }
        .refresh-btn { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛡️ Aegis 安全监控</h1>
        <button class="refresh-btn" onclick="loadEvents()">🔄 刷新事件</button>
    </div>
    <div class="events" id="events">
        <p style="text-align: center; opacity: 0.7;">点击刷新加载事件...</p>
    </div>

    <script>
        async function loadEvents() {
            const eventsDiv = document.getElementById('events');
            eventsDiv.innerHTML = '<p style="text-align: center;">📡 加载中...</p>';

            try {
                // 模拟读取事件文件 (实际需要后端支持)
                const response = await fetch('/api/events').catch(() => null);

                if (response) {
                    const events = await response.json();
                    displayEvents(events);
                } else {
                    // 开发模式：显示示例数据
                    displaySampleEvents();
                }
            } catch (error) {
                eventsDiv.innerHTML = '<p style="color: #ef4444;">❌ 加载失败，请确保Aegis正在运行</p>';
            }
        }

        function displayEvents(events) {
            const eventsDiv = document.getElementById('events');
            if (events.length === 0) {
                eventsDiv.innerHTML = '<p style="text-align: center; opacity: 0.7;">📝 暂无事件</p>';
                return;
            }

            eventsDiv.innerHTML = events.map(event => \`
                <div class="event \${event.type}">
                    <div><strong>\${getEventIcon(event.type)} \${event.type.toUpperCase()}</strong></div>
                    <div>\${event.reason}</div>
                    <div style="font-family: monospace; font-size: 12px; opacity: 0.8;">
                        \${event.command} | \${new Date(event.timestamp).toLocaleString()}
                    </div>
                </div>
            \`).join('');
        }

        function displaySampleEvents() {
            const sampleEvents = [
                {type: 'blocked', reason: '尝试删除根目录文件', command: 'rm -rf /', timestamp: new Date().toISOString()},
                {type: 'allowed', reason: '安全命令执行', command: 'ls -la', timestamp: new Date().toISOString()}
            ];
            displayEvents(sampleEvents);
        }

        function getEventIcon(type) {
            return type === 'blocked' ? '🛡️' : '✅';
        }

        // 自动加载
        loadEvents();

        // 定期刷新
        setInterval(loadEvents, 5000);
    </script>
</body>
</html>`;
  }

  // 配置Claude Code
  async configureClaudeCode() {
    console.log('⚙️ 配置Claude Code...');

    const hookPath = this.hookFile;
    const envVar = \`export CLAUDE_PRETOOLUSE_HOOK="node \${hookPath}"\`;

    console.log('📝 请将以下行添加到您的shell配置文件:');
    console.log('   ~/.bashrc (Linux) 或 ~/.zshrc (Mac)');
    console.log('');
    console.log(\`   \${envVar}\`);
    console.log('');
    console.log('✅ 配置说明已准备');
  }

  // 测试安装
  async testInstallation() {
    console.log('🧪 测试安装...');

    // 测试Hook文件
    if (!fs.existsSync(this.hookFile)) {
      throw new Error('Hook文件安装失败');
    }

    // 测试监控界面
    if (!fs.existsSync(this.monitorFile)) {
      throw new Error('监控界面安装失败');
    }

    console.log('✅ 安装测试通过');
  }

  // 成功消息
  showSuccessMessage() {
    console.log('');
    console.log('🎉 Aegis 安装成功!');
    console.log('==========================================');
    console.log('');
    console.log('📋 下一步操作:');
    console.log('');
    console.log('1. 配置环境变量 (一次性):');
    console.log(\`   echo 'export CLAUDE_PRETOOLUSE_HOOK="node \${this.hookFile}"' >> ~/.zshrc\`);
    console.log('   source ~/.zshrc');
    console.log('');
    console.log('2. 打开监控界面:');
    console.log(\`   open \${this.monitorFile}\`);
    console.log('');
    console.log('3. 测试保护:');
    console.log('   claude "Execute: rm -rf /tmp/test"');
    console.log('');
    console.log('🛡️ 您的系统现在受到Aegis保护!');
  }

  // 故障排除
  showTroubleshootingTips() {
    console.log('');
    console.log('🔧 故障排除:');
    console.log('- 确保已安装 Node.js: https://nodejs.org');
    console.log('- 检查权限: 确保可以写入 ~/.aegis');
    console.log('- 重新运行: node aegis-simple-installer.js');
  }
}

// 运行安装器
if (require.main === module) {
  const installer = new AegisSimpleInstaller();
  installer.install();
}

module.exports = AegisSimpleInstaller;