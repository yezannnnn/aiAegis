#!/usr/bin/env node
/**
 * Aegis Hook 自动配置脚本
 * 支持 npm install 后的自动配置
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class AegisHookInstaller {
  constructor() {
    this.homeDir = os.homedir();
    this.packageRoot = path.resolve(__dirname, '..');
  }

  run() {
    console.log('🛡️ Aegis Hook 配置器');
    console.log('====================');
    console.log('');

    try {
      // 检测安装环境
      const installInfo = this.detectInstallation();
      console.log(`📦 检测到安装方式: ${installInfo.type}`);
      console.log(`📍 Hook路径: ${installInfo.hookPath}`);
      console.log('');

      // 配置环境变量
      this.configureEnvironment(installInfo.hookCommand);

      // 验证配置
      this.verifyConfiguration();

      console.log('');
      console.log('🎉 Hook配置完成！');
      console.log('');
      console.log('📋 使用说明:');
      console.log('  • 重启 Claude Code CLI 生效');
      console.log('  • 运行 npm run test-hook 测试');
      console.log('  • 访问 http://localhost:3001 查看监控');

    } catch (error) {
      console.error('❌ 配置失败:', error.message);
      process.exit(1);
    }
  }

  /**
   * 检测安装方式
   */
  detectInstallation() {
    // 方式1: npm global install
    try {
      const globalPath = execSync('npm root -g', { encoding: 'utf8' }).trim();
      const globalHook = path.join(globalPath, 'aegis/src/hook.js');
      if (fs.existsSync(globalHook)) {
        return {
          type: 'Global NPM Install',
          hookPath: globalHook,
          hookCommand: `node ${globalHook}`
        };
      }
    } catch {}

    // 方式2: npm local install (在项目中)
    const localHook = path.join(process.cwd(), 'node_modules/aegis/src/hook.js');
    if (fs.existsSync(localHook)) {
      return {
        type: 'Local NPM Install',
        hookPath: localHook,
        hookCommand: `node ${localHook}`
      };
    }

    // 方式3: 开发环境
    const devHook = path.join(this.packageRoot, 'src/hook.js');
    if (fs.existsSync(devHook)) {
      return {
        type: 'Development Environment',
        hookPath: devHook,
        hookCommand: `node ${devHook}`
      };
    }

    // 方式4: 通过 aegis-hook 命令（如果全局安装了）
    try {
      execSync('which aegis-hook', { stdio: 'ignore' });
      return {
        type: 'Global Bin Command',
        hookPath: 'aegis-hook',
        hookCommand: 'aegis-hook'
      };
    } catch {}

    throw new Error('未找到 Aegis hook 文件。请确保正确安装了 aegis 包。');
  }

  /**
   * 配置环境变量
   */
  configureEnvironment(hookCommand) {
    console.log('⚙️ 配置环境变量...');

    const hookEnv = `export CLAUDE_PRETOOLUSE_HOOK="${hookCommand}"`;

    // 检测并配置 shell
    const shell = process.env.SHELL || '';
    const shells = [];

    if (shell.includes('zsh') || fs.existsSync(path.join(this.homeDir, '.zshrc'))) {
      shells.push('.zshrc');
    }
    if (shell.includes('bash') || fs.existsSync(path.join(this.homeDir, '.bashrc'))) {
      shells.push('.bashrc');
    }
    if (fs.existsSync(path.join(this.homeDir, '.profile'))) {
      shells.push('.profile');
    }

    let configured = false;

    for (const shellFile of shells) {
      const shellPath = path.join(this.homeDir, shellFile);
      if (fs.existsSync(shellPath)) {
        const content = fs.readFileSync(shellPath, 'utf8');

        // 检查是否已配置
        if (content.includes('CLAUDE_PRETOOLUSE_HOOK')) {
          // 更新现有配置
          const updatedContent = content.replace(
            /export CLAUDE_PRETOOLUSE_HOOK=.*/g,
            hookEnv
          );
          fs.writeFileSync(shellPath, updatedContent);
          console.log(`✅ 更新 ${shellFile}`);
        } else {
          // 添加新配置
          fs.appendFileSync(shellPath, `\n# Aegis Security Hook\n${hookEnv}\n`);
          console.log(`✅ 配置 ${shellFile}`);
        }
        configured = true;
      }
    }

    if (!configured) {
      console.log('⚠️ 请手动添加到您的 shell 配置文件:');
      console.log(`   ${hookEnv}`);
    }

    // 设置当前会话
    process.env.CLAUDE_PRETOOLUSE_HOOK = hookCommand;
  }

  /**
   * 验证配置
   */
  verifyConfiguration() {
    console.log('🔍 验证配置...');

    // 检查环境变量
    const hookVar = process.env.CLAUDE_PRETOOLUSE_HOOK;
    if (!hookVar) {
      throw new Error('环境变量未设置');
    }

    console.log(`✅ 环境变量: ${hookVar}`);

    // 检查 hook 文件是否可执行
    const [command, ...args] = hookVar.split(' ');
    if (command === 'node' && args.length > 0) {
      const hookFile = args[0];
      if (!fs.existsSync(hookFile)) {
        throw new Error(`Hook 文件不存在: ${hookFile}`);
      }
      console.log(`✅ Hook 文件: ${hookFile}`);
    } else if (command === 'aegis-hook') {
      try {
        execSync('which aegis-hook', { stdio: 'ignore' });
        console.log(`✅ Hook 命令: ${command}`);
      } catch {
        throw new Error('aegis-hook 命令不可用');
      }
    }
  }
}

// 运行安装
if (require.main === module) {
  const installer = new AegisHookInstaller();
  installer.run();
}

module.exports = AegisHookInstaller;