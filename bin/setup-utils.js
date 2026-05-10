const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('cross-spawn');
const chalk = require('chalk');
const ora = require('ora');
const os = require('os');

class AegisSetupUtils {
  constructor() {
    this.homeDir = os.homedir();
    this.aegisDir = path.join(this.homeDir, '.aegis');
    this.userRulesDir = path.join(this.homeDir, '.aegis', 'rules');
    // Claude Code 的 settings.json 位于 ~/.claude/settings.json
    this.claudeSettingsFile = path.join(this.homeDir, '.claude', 'settings.json');
    this.packageDir = path.dirname(__dirname); // npm 包根目录
    this.backendDir = path.join(this.packageDir, 'backend');
  }

  // ============================================================
  // 创建目录结构
  // ============================================================
  async createDirectories() {
    const spinner = ora('创建配置目录...').start();
    try {
      await fs.ensureDir(this.aegisDir);
      await fs.ensureDir(this.userRulesDir);
      await fs.ensureDir(path.join(this.aegisDir, 'logs'));
      await fs.ensureDir(path.join(this.aegisDir, 'backup'));
      spinner.succeed(`配置目录已创建: ${this.aegisDir}`);
    } catch (error) {
      spinner.fail('创建配置目录失败');
      throw error;
    }
  }

  // ============================================================
  // 复制 Hook 文件 + 示例规则
  // ============================================================
  async copySystemFiles() {
    const spinner = ora('复制系统文件...').start();
    try {
      // 复制 Hook（hooks/claude-code/universal-hook-v2.js → ~/.aegis/universal-hook.js）
      const hookSrc = path.join(this.packageDir, 'hooks', 'claude-code', 'universal-hook-v2.js');
      const hookDest = path.join(this.aegisDir, 'universal-hook.js');

      if (await fs.pathExists(hookSrc)) {
        await fs.copy(hookSrc, hookDest);
      } else {
        throw new Error(`Hook 文件不存在: ${hookSrc}`);
      }

      // 复制 config.json 路径信息到 Hook 读取位置
      const hookConfigDest = path.join(this.aegisDir, 'config.json');
      if (!await fs.pathExists(hookConfigDest)) {
        await fs.writeJson(hookConfigDest, { ports: { webInterface: 3001 } }, { spaces: 2 });
      }

      // 复制示例规则（仅首次，不覆盖用户已有文件）
      const exampleSrc = path.join(this.backendDir, 'dist', 'rules', 'example-custom.yaml');
      const exampleDest = path.join(this.userRulesDir, 'example-custom.yaml');
      if (await fs.pathExists(exampleSrc) && !await fs.pathExists(exampleDest)) {
        await fs.copy(exampleSrc, exampleDest);
      }

      spinner.succeed('系统文件复制完成');
    } catch (error) {
      spinner.fail('复制系统文件失败: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // 配置 Claude Code Hook
  // ============================================================
  async setupClaudeCodeHook() {
    const spinner = ora('配置 Claude Code Hook...').start();
    try {
      await fs.ensureDir(path.dirname(this.claudeSettingsFile));

      let settings = {};
      if (await fs.pathExists(this.claudeSettingsFile)) {
        try {
          settings = await fs.readJson(this.claudeSettingsFile);
          // 备份
          const backupFile = path.join(this.aegisDir, 'backup', `claude-settings-${Date.now()}.json`);
          await fs.writeJson(backupFile, settings, { spaces: 2 });
        } catch {
          settings = {};
        }
      }

      const hookPath = path.join(this.aegisDir, 'universal-hook.js');

      // 写入 Claude Code hooks 格式（PreToolUse）
      settings.hooks = settings.hooks || {};
      settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];

      // 移除旧的 aegis hook（避免重复）
      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
        h => !JSON.stringify(h).includes('.aegis')
      );

      settings.hooks.PreToolUse.push({
        matcher: 'Bash',
        hooks: [{
          type: 'command',
          command: `node "${hookPath}"`,
          timeout: 120
        }]
      });

      await fs.writeJson(this.claudeSettingsFile, settings, { spaces: 2 });
      spinner.succeed('Claude Code Hook 已配置');

      return {
        settingsFile: this.claudeSettingsFile,
        hookPath,
        backupCreated: true,
      };
    } catch (error) {
      spinner.fail('Hook 配置失败: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // 配置 Hermes Plugin Hook
  // ============================================================
  async setupHermesHook() {
    const spinner = ora('配置 Hermes Plugin Hook...').start();
    try {
      const hermesPluginDir = path.join(this.homeDir, '.hermes', 'plugins', 'aegis');
      await fs.ensureDir(hermesPluginDir);

      // 1. 复制 plugin.py 作为 __init__.py
      const pluginSrc = path.join(this.packageDir, 'hooks', 'hermes', 'plugin.py');
      const initDest = path.join(hermesPluginDir, '__init__.py');

      if (await fs.pathExists(pluginSrc)) {
        await fs.copy(pluginSrc, initDest, { overwrite: true });
      } else {
        throw new Error(`Hermes Plugin 文件不存在: ${pluginSrc}`);
      }

      // 2. 创建 plugin.yaml（插件元数据）
      const yamlContent = `name: aegis
description: Aegis AI Security Monitor - intercept dangerous terminal commands
version: 2.0.0
hooks:
  - pre_tool_call
  - pre_llm_call
`;
      const yamlDest = path.join(hermesPluginDir, 'plugin.yaml');
      await fs.writeFile(yamlDest, yamlContent, 'utf8');

      // 3. 自动启用插件（执行 hermes plugins enable aegis）
      try {
        await this.runCommand('hermes', ['plugins', 'enable', 'aegis'], {
          captureOutput: true,
        });
        spinner.succeed('Hermes Plugin Hook 已配置并启用');
      } catch (enableError) {
        // hermes CLI 可能不在 PATH，提示用户手动启用
        spinner.warn('Hermes Plugin 文件已安装，但自动启用失败');
        console.log(chalk.yellow('   请手动运行: hermes plugins enable aegis'));
      }

      return {
        pluginDir: hermesPluginDir,
        pluginPath: initDest,
        enabled: true,
        restartRequired: true,
      };
    } catch (error) {
      spinner.fail('Hermes Plugin Hook 配置失败: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // 安装后端运行时依赖（frontend 已预构建，无需安装前端 deps）
  // ============================================================
  async installDependencies() {
    const spinner = ora('安装后端运行时依赖（sqlite3 等原生模块）...').start();
    try {
      await this.runCommand('npm', ['install', '--production', '--no-audit', '--no-fund', '--legacy-peer-deps'], {
        cwd: this.backendDir,
        captureOutput: false,
      });
      spinner.succeed('后端依赖安装完成');
    } catch (error) {
      spinner.fail('后端依赖安装失败: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // 创建系统配置
  // ============================================================
  async createSystemConfig(options = {}) {
    const port = parseInt(options.port || '3001');
    const config = {
      version: '2.0.0',
      setupDate: new Date().toISOString(),
      ports: {
        webInterface: port,
      },
      backend: { port, host: 'localhost' },
      features: {
        claudeHookEnabled: true,
        realTimeMonitoring: true,
        approvalSystem: true,
      },
      directories: {
        home: this.aegisDir,
        rules: this.userRulesDir,
        logs: path.join(this.aegisDir, 'logs'),
      },
    };
    await fs.writeJson(path.join(this.aegisDir, 'config.json'), config, { spaces: 2 });
    return config;
  }

  // ============================================================
  // 验证安装
  // ============================================================
  async validateInstallation() {
    const spinner = ora('验证安装...').start();
    try {
      const hookFile = path.join(this.aegisDir, 'universal-hook.js');
      const distMain = path.join(this.backendDir, 'dist', 'main.js');

      if (!await fs.pathExists(hookFile)) {
        throw new Error(`Hook 文件不存在: ${hookFile}`);
      }
      if (!await fs.pathExists(distMain)) {
        throw new Error(`后端编译产物不存在: ${distMain}（请先运行 aegis build）`);
      }

      spinner.succeed('安装验证通过');
    } catch (error) {
      spinner.fail('验证失败: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // 显示安装摘要
  // ============================================================
  showInstallationSummary(config, hookInfo, hermesHookInfo) {
    const port = config.ports?.webInterface || config.backend?.port || 3001;
    console.log('');
    console.log(chalk.green('🎉 Aegis Security Monitor 安装完成!'));
    console.log('');
    console.log(chalk.cyan('📍 配置信息:'));
    console.log(`   配置目录:  ${chalk.yellow(this.aegisDir)}`);
    console.log(`   用户规则:  ${chalk.yellow(this.userRulesDir)}`);
    if (hookInfo) {
      console.log(`   Claude Hook: ${chalk.yellow(hookInfo.hookPath)}`);
    }
    if (hermesHookInfo) {
      console.log(`   Hermes Plugin: ${chalk.yellow(hermesHookInfo.pluginPath)}`);
    }
    console.log('');
    console.log(chalk.cyan('📋 下一步:'));
    console.log(`   1. 运行 ${chalk.green('aegis start')} 启动服务`);
    console.log(`   2. 访问 ${chalk.green(`http://localhost:${port}`)} 查看监控界面`);
    console.log(`   3. 运行 ${chalk.green('aegis rules new my-rules')} 创建自定义规则`);
    console.log('');
    if (hookInfo?.backupCreated) {
      console.log(chalk.gray('💾 原 Claude 配置已备份到 ~/.aegis/backup/'));
    }
    if (hermesHookInfo?.restartRequired) {
      console.log(chalk.yellow('⚠️  Hermes Plugin 已更新，请重启 Hermes CLI 使 Plugin 生效'));
    }
  }

  // ============================================================
  // 重置
  // ============================================================
  async resetInstallation() {
    const spinner = ora('重置配置...').start();
    try {
      if (await fs.pathExists(this.aegisDir)) {
        await fs.remove(this.aegisDir);
      }
      // 移除 Claude Code hook 配置
      if (await fs.pathExists(this.claudeSettingsFile)) {
        const settings = await fs.readJson(this.claudeSettingsFile);
        if (settings.hooks?.PreToolUse) {
          settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
            h => !JSON.stringify(h).includes('.aegis')
          );
        }
        await fs.writeJson(this.claudeSettingsFile, settings, { spaces: 2 });
      }
      spinner.succeed('配置已重置');
    } catch (error) {
      spinner.fail('重置失败');
      throw error;
    }
  }

  // ============================================================
  // 辅助：运行命令
  // ============================================================
  runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: options.captureOutput === false ? 'inherit' : 'pipe',
        cwd: options.cwd,
      });

      let stderr = '';
      if (child.stderr) {
        child.stderr.on('data', d => { stderr += d.toString(); });
      }

      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `exit code ${code}`));
      });
      child.on('error', reject);
    });
  }
}

module.exports = AegisSetupUtils;
