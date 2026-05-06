#!/usr/bin/env node

/**
 * Aegis Setup Script - aegis setup
 * 一键配置所有安全组件，包括 Claude Code Hook
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class AegisSetup {
  constructor() {
    this.aegisDir = path.join(os.homedir(), '.aegis');
    this.configFile = path.join(this.aegisDir, 'config.json');
    this.packageRoot = path.resolve(__dirname, '..');

    // Claude Code 配置路径
    this.claudeConfigDir = path.join(os.homedir(), '.config', 'claude-code');
    this.claudeSettingsFile = path.join(this.claudeConfigDir, 'settings.json');
  }

  async run() {
    console.log('🛡️ Aegis 智能安全系统配置');
    console.log('========================');
    console.log('');

    try {
      // 1. 创建目录结构
      this.createDirectories();

      // 2. 复制必要的hook文件
      this.installHookFiles();

      // 3. 检测并配置 Claude Code Hook
      await this.configureClaudeHook();

      // 4. 创建配置文件
      this.createConfig();

      // 5. 验证配置
      this.verifySetup();

      console.log('');
      console.log('🎉 Aegis 配置完成！');
      console.log('');
      console.log('📋 使用指南:');
      console.log('  aegis start         # 启动监控系统');
      console.log('  打开 http://localhost:3001  # Web监控界面');
      console.log('  重启 Claude Code CLI # 使hook生效');
      console.log('');
      console.log('🧪 测试命令:');
      console.log('  echo \'{"tool_name":"Bash","tool_input":{"command":"echo test"}}\' | node ~/.aegis/universal-hook.js');

    } catch (error) {
      console.error('❌ 配置失败:', error.message);
      console.error('');
      console.error('🔧 故障排除:');
      console.error('  1. 检查权限: ls -la ~/.aegis/');
      console.error('  2. 手动测试: aegis --version');
      console.error('  3. 查看日志: 运行命令后的详细错误信息');
      process.exit(1);
    }
  }

  /**
   * 创建必要的目录结构
   */
  createDirectories() {
    console.log('📁 创建目录结构...');
    if (!fs.existsSync(this.aegisDir)) {
      fs.mkdirSync(this.aegisDir, { recursive: true });
      console.log(`✅ 创建目录: ${this.aegisDir}`);
    } else {
      console.log(`✅ 目录已存在: ${this.aegisDir}`);
    }
  }

  /**
   * 安装hook文件到用户目录
   */
  installHookFiles() {
    console.log('🪝 安装Universal Hook...');

    // 复制universal-hook.js到用户目录
    const sourceHook = path.join(__dirname, '../.aegis/universal-hook.js');
    const targetHook = path.join(this.aegisDir, 'universal-hook.js');

    if (fs.existsSync(sourceHook)) {
      fs.copyFileSync(sourceHook, targetHook);
      if (process.platform !== 'win32') {
        fs.chmodSync(targetHook, 0o755);
      }
      console.log(`✅ 复制Hook: ${targetHook}`);
    } else {
      console.log('⚠️ 未找到universal-hook.js，将创建基础版本...');
      this.createBasicHook(targetHook);
    }

    // 复制必要的依赖文件
    this.copyDependencyFiles();
  }

  /**
   * 创建基础Hook（如果universal-hook.js不存在）
   */
  createBasicHook(targetPath) {
    const basicHook = `#!/usr/bin/env node
/**
 * Aegis Basic Hook - 由 setup 自动生成
 */

const http = require('http');

const AEGIS_PORT = 9876;
const MAX_STDIN = 1024 * 1024;

let raw = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length < MAX_STDIN) {
    raw += chunk.substring(0, MAX_STDIN - raw.length);
  }
});

process.stdin.on('end', async () => {
  try {
    // 解析Claude Code输入
    if (!raw.includes('"tool_name"')) {
      process.stdout.write(raw);
      return;
    }

    const input = JSON.parse(raw);
    if (input.tool_name !== 'Bash' || !input.tool_input?.command) {
      process.stdout.write(raw);
      return;
    }

    const command = input.tool_input.command;

    // 发送到监控系统
    const result = await sendToMonitor(command);

    if (result.approved) {
      process.stdout.write(raw);
    } else {
      console.error('[Aegis] BLOCKED: ' + result.reason);
      process.exit(2);
    }

  } catch (error) {
    console.error('[Aegis] Hook error:', error.message);
    process.stdout.write(raw);
  }
});

async function sendToMonitor(command) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      type: 'approval_request',
      command: command,
      sessionId: Date.now() + '-' + Math.random().toString(36).substr(2, 8),
      agentType: 'claude-code',
      timestamp: new Date().toISOString()
    });

    const options = {
      hostname: '127.0.0.1',
      port: AEGIS_PORT,
      path: '/hook-event',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 60000
    };

    const req = http.request(options, (res) => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(response);
          resolve({ approved: res.statusCode === 200, reason: result.reason || result.message });
        } catch {
          resolve({ approved: res.statusCode === 200, reason: 'Unknown' });
        }
      });
    });

    req.on('error', () => resolve({ approved: true, reason: 'Monitor not available' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ approved: true, reason: 'Timeout' });
    });

    req.write(data);
    req.end();
  });
}`;

    fs.writeFileSync(targetPath, basicHook);
    if (process.platform !== 'win32') {
      fs.chmodSync(targetPath, 0o755);
    }
    console.log('✅ 创建基础Hook版本');
  }

  /**
   * 复制依赖文件
   */
  copyDependencyFiles() {
    const files = [
      { source: '../.aegis/rule-engine.js', target: 'rule-engine.js' },
      { source: '../.aegis/aegis-rules.yaml', target: 'aegis-rules.yaml' }
    ];

    for (const file of files) {
      const sourcePath = path.join(__dirname, file.source);
      const targetPath = path.join(this.aegisDir, file.target);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✅ 复制: ${file.target}`);
      }
    }
  }

  /**
   * 配置Claude Code Hook - 纯 settings.json 方案
   */
  async configureClaudeHook() {
    console.log('⚙️ 配置 Claude Code Hook (仅 settings.json)...');

    const hookPath = path.join(this.aegisDir, 'universal-hook.js');
    const hookCommand = `node ${hookPath}`;

    // 检测安装方式并获取最佳路径
    const installInfo = this.detectInstallation(hookCommand);
    console.log(`📦 检测到: ${installInfo.type}`);

    // 只使用 Claude Code settings.json
    this.configureClaudeSettings(installInfo.hookCommand);

    console.log('');
    console.log('✅ Claude Hook 配置完成！');
    console.log('📋 配置方式: settings.json (纯净方案)');
    console.log('💡 注意: 已移除环境变量配置，完全依赖 Claude Code settings.json');
  }

  /**
   * 检测安装方式
   */
  detectInstallation(fallbackCommand) {
    try {
      // 检查是否有全局的aegis-hook命令
      execSync('which aegis-hook 2>/dev/null', { stdio: 'ignore' });
      return {
        type: 'Global Aegis Command',
        hookCommand: 'aegis-hook'
      };
    } catch {}

    try {
      // 检查项目本地安装
      const localHook = path.join(process.cwd(), 'node_modules/.bin/aegis-hook');
      if (fs.existsSync(localHook)) {
        return {
          type: 'Local Project Install',
          hookCommand: localHook
        };
      }
    } catch {}

    // 使用用户目录的hook文件
    return {
      type: 'User Directory Hook',
      hookCommand: fallbackCommand
    };
  }

  /**
   * 配置 Claude Code settings.json
   */
  configureClaudeSettings(hookCommand) {
    console.log('📝 配置 Claude Code settings.json...');

    // 确保配置目录存在
    if (!fs.existsSync(this.claudeConfigDir)) {
      fs.mkdirSync(this.claudeConfigDir, { recursive: true });
      console.log(`✅ 创建配置目录: ${this.claudeConfigDir}`);
    }

    // 读取现有配置或创建新配置
    let settings = {};
    if (fs.existsSync(this.claudeSettingsFile)) {
      try {
        const content = fs.readFileSync(this.claudeSettingsFile, 'utf8');
        settings = JSON.parse(content);
        console.log('✅ 读取现有 settings.json');
      } catch (error) {
        console.log('⚠️ settings.json 格式错误，将重新创建');
        settings = {};
      }
    }

    // 配置 hook 设置
    settings.preToolUseHook = hookCommand;

    // 也可以配置特定工具的hook
    if (!settings.toolHooks) {
      settings.toolHooks = {};
    }
    settings.toolHooks.Bash = hookCommand;

    // 添加 Aegis 相关配置
    settings.aegis = {
      enabled: true,
      hookPath: hookCommand,
      configuredBy: 'aegis-setup',
      configuredAt: new Date().toISOString(),
      version: '2.0.0'
    };

    // 写入配置文件
    try {
      fs.writeFileSync(this.claudeSettingsFile, JSON.stringify(settings, null, 2));
      console.log(`✅ 更新 Claude Code settings.json`);
      console.log(`   位置: ${this.claudeSettingsFile}`);
    } catch (error) {
      throw new Error(`无法写入 settings.json: ${error.message}`);
    }
  }

  // 环境变量配置方法已移除 - 使用纯 settings.json 方案

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

  /**
   * 创建配置文件
   */
  createConfig() {
    console.log('📝 创建配置文件...');

    const config = {
      version: '2.0.0',
      installed: true,
      installedAt: new Date().toISOString(),
      setupBy: 'aegis-setup',
      hooks: {
        claudeCodeHookFile: path.join(this.aegisDir, 'universal-hook.js'),
        claudeSettingsFile: this.claudeSettingsFile,
        configMethod: 'settings.json-only',
        environmentVariable: 'disabled'
      },
      ports: {
        hookBackend: 9876,
        webInterface: 3001,
        websocket: 8901
      },
      features: {
        realTimeMonitoring: true,
        webInterface: true,
        astEngine: true,
        dualApproval: true,
        typeScriptSystem: true
      },
      paths: {
        aegisDir: this.aegisDir,
        hookFile: path.join(this.aegisDir, 'universal-hook.js'),
        configFile: this.configFile
      }
    };

    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    console.log(`✅ 配置文件: ${this.configFile}`);
  }

  /**
   * 验证安装配置
   */
  verifySetup() {
    console.log('🔍 验证配置...');

    const checks = [
      {
        name: 'Aegis目录',
        check: () => fs.existsSync(this.aegisDir),
        path: this.aegisDir
      },
      {
        name: 'Universal Hook',
        check: () => fs.existsSync(path.join(this.aegisDir, 'universal-hook.js')),
        path: path.join(this.aegisDir, 'universal-hook.js')
      },
      {
        name: 'Aegis配置文件',
        check: () => fs.existsSync(this.configFile),
        path: this.configFile
      },
      {
        name: 'Claude Code配置目录',
        check: () => fs.existsSync(this.claudeConfigDir),
        path: this.claudeConfigDir
      },
      {
        name: 'Claude settings.json',
        check: () => fs.existsSync(this.claudeSettingsFile),
        path: this.claudeSettingsFile
      }
    ];

    // 验证 settings.json 内容
    if (fs.existsSync(this.claudeSettingsFile)) {
      try {
        const settings = JSON.parse(fs.readFileSync(this.claudeSettingsFile, 'utf8'));
        checks.push({
          name: 'Hook配置 (settings.json)',
          check: () => !!settings.preToolUseHook,
          path: settings.preToolUseHook || '未配置'
        });
      } catch (error) {
        checks.push({
          name: 'Hook配置 (settings.json)',
          check: () => false,
          path: 'JSON解析失败'
        });
      }
    }

    let allPassed = true;
    let criticalFailed = false;

    for (const check of checks) {
      if (check.check()) {
        console.log(`✅ ${check.name}: ${check.path}`);
      } else {
        const isCritical = check.name.includes('Hook') || check.name.includes('Aegis目录');
        const icon = isCritical ? '❌' : '⚠️';
        console.log(`${icon} ${check.name}: 失败 - ${check.path}`);

        if (isCritical) {
          criticalFailed = true;
        }
        allPassed = false;
      }
    }

    // 检查是否还有环境变量残留
    if (process.env.CLAUDE_PRETOOLUSE_HOOK) {
      console.log('⚠️ 检测到环境变量残留，建议清理:');
      console.log(`   unset CLAUDE_PRETOOLUSE_HOOK`);
    }

    if (criticalFailed) {
      throw new Error('关键配置验证失败');
    }

    if (allPassed) {
      console.log('✅ 所有配置验证通过 (纯 settings.json 方案)');
    } else {
      console.log('⚠️ 部分非关键配置失败，但系统可以正常工作');
    }
  }
}

// 运行配置
if (require.main === module) {
  const setup = new AegisSetup();
  setup.run().catch((error) => {
    console.error('\n❌ 安装失败:', error.message);
    process.exit(1);
  });
}

module.exports = AegisSetup;