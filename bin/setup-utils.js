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
    this.claudeConfigDir = path.join(this.homeDir, '.config', 'claude-code');
    this.packageDir = path.dirname(__dirname); // aegis-v2根目录
  }

  /**
   * 创建Aegis配置目录
   */
  async createDirectories() {
    const spinner = ora('创建配置目录...').start();

    try {
      await fs.ensureDir(this.aegisDir);
      await fs.ensureDir(path.join(this.aegisDir, 'rules'));
      await fs.ensureDir(path.join(this.aegisDir, 'logs'));
      await fs.ensureDir(path.join(this.aegisDir, 'backup'));

      spinner.succeed('配置目录已创建');
    } catch (error) {
      spinner.fail('创建配置目录失败');
      throw error;
    }
  }

  /**
   * 复制Hook和规则文件
   */
  async copySystemFiles() {
    const spinner = ora('复制系统文件...').start();

    try {
      const filesToCopy = [
        {
          src: path.join(this.packageDir, 'universal-hook.js'),
          dest: path.join(this.aegisDir, 'universal-hook.js'),
          name: 'Universal Hook'
        },
        {
          src: path.join(this.packageDir, 'rule-engine.js'),
          dest: path.join(this.aegisDir, 'rule-engine.js'),
          name: 'Rule Engine'
        },
        {
          src: path.join(this.packageDir, 'aegis-rules.yaml'),
          dest: path.join(this.aegisDir, 'aegis-rules.yaml'),
          name: 'Default Rules'
        }
      ];

      for (const file of filesToCopy) {
        if (await fs.pathExists(file.src)) {
          await fs.copy(file.src, file.dest);
        } else {
          throw new Error(`源文件不存在: ${file.src}`);
        }
      }

      spinner.succeed('系统文件复制完成');
    } catch (error) {
      spinner.fail('复制系统文件失败');
      throw error;
    }
  }

  /**
   * 配置Claude Code Hook集成
   */
  async setupClaudeCodeHook() {
    const spinner = ora('配置Claude Code Hook集成...').start();

    try {
      // 确保Claude Code配置目录存在
      await fs.ensureDir(this.claudeConfigDir);

      const settingsFile = path.join(this.claudeConfigDir, 'settings.json');
      let settings = {};

      // 读取现有设置
      if (await fs.pathExists(settingsFile)) {
        try {
          settings = await fs.readJson(settingsFile);

          // 备份原设置
          const backupFile = path.join(this.aegisDir, 'backup', `claude-settings-backup-${Date.now()}.json`);
          await fs.writeJson(backupFile, settings, { spaces: 2 });

        } catch (parseError) {
          spinner.warn('无法解析现有Claude配置，将创建新配置');
          settings = {};
        }
      }

      // 设置Hook路径
      const hookPath = path.join(this.aegisDir, 'universal-hook.js');
      settings.preToolUseHook = `node "${hookPath}"`;

      // 写入新设置
      await fs.writeJson(settingsFile, settings, { spaces: 2 });

      spinner.succeed('Claude Code Hook集成完成');

      return {
        settingsFile,
        hookPath,
        backupCreated: await fs.pathExists(path.join(this.aegisDir, 'backup'))
      };

    } catch (error) {
      spinner.fail('Claude Code Hook配置失败');
      throw error;
    }
  }

  /**
   * 安装项目依赖
   */
  async installDependencies() {
    const backendDir = path.join(this.packageDir, 'backend');
    const frontendDir = path.join(this.packageDir, 'frontend');

    // 检查npm是否可用
    try {
      await this.runCommand('npm', ['--version'], { captureOutput: true });
    } catch (error) {
      throw new Error('npm 不可用，请确保已安装 Node.js');
    }

    // 安装后端依赖
    console.log('🔧 开始安装后端依赖...');
    try {
      // 清理可能的缓存问题
      await this.runCommand('npm', ['cache', 'clean', '--force'], { cwd: backendDir }).catch(() => {
        console.log('⚠️ 清理npm缓存失败，继续安装...');
      });

      // 尝试安装，使用更宽松的参数
      await this.runCommand('npm', ['install', '--no-audit', '--no-fund', '--legacy-peer-deps'], { cwd: backendDir });
      console.log('✅ 后端依赖安装完成');
    } catch (error) {
      console.error('❌ 后端依赖安装失败，尝试备用方案...');

      // 备用方案：只安装核心依赖
      try {
        await this.runCommand('npm', ['install', '@nestjs/common@9.4.3', '@nestjs/core@9.4.3', 'express@4.18.2', '--save'], { cwd: backendDir });
        console.log('✅ 后端核心依赖安装完成');
      } catch (backupError) {
        throw new Error(`后端依赖安装失败: ${error.message}`);
      }
    }

    // 安装前端依赖
    console.log('🔧 开始安装前端依赖...');
    try {
      await this.runCommand('npm', ['cache', 'clean', '--force'], { cwd: frontendDir }).catch(() => {
        console.log('⚠️ 清理npm缓存失败，继续安装...');
      });

      await this.runCommand('npm', ['install', '--no-audit', '--no-fund', '--legacy-peer-deps'], { cwd: frontendDir });
      console.log('✅ 前端依赖安装完成');
    } catch (error) {
      console.error('❌ 前端依赖安装失败，尝试备用方案...');

      // 备用方案：只安装Vue核心
      try {
        await this.runCommand('npm', ['install', 'vue@3.2.47', 'vite@4.3.9', '--save'], { cwd: frontendDir });
        console.log('✅ 前端核心依赖安装完成');
      } catch (backupError) {
        throw new Error(`前端依赖安装失败: ${error.message}`);
      }
    }
  }

  /**
   * 构建项目
   */
  async buildProject() {
    const spinner = ora('构建项目...').start();

    try {
      const backendDir = path.join(this.packageDir, 'backend');
      await this.runCommand('npm', ['run', 'build'], { cwd: backendDir });

      spinner.succeed('项目构建完成');
    } catch (error) {
      spinner.fail('项目构建失败');
      throw error;
    }
  }

  /**
   * 创建系统配置文件
   */
  async createSystemConfig(options = {}) {
    const configFile = path.join(this.aegisDir, 'config.json');

    const config = {
      version: '2.0.0',
      setupDate: new Date().toISOString(),
      backend: {
        port: options.port || 3001,
        host: 'localhost'
      },
      frontend: {
        port: options.frontendPort || 5173,
        host: 'localhost'
      },
      features: {
        claudeHookEnabled: true,
        realTimeMonitoring: true,
        approvalSystem: true
      },
      directories: {
        home: this.aegisDir,
        rules: path.join(this.aegisDir, 'rules'),
        logs: path.join(this.aegisDir, 'logs'),
        backup: path.join(this.aegisDir, 'backup')
      }
    };

    await fs.writeJson(configFile, config, { spaces: 2 });
    return config;
  }

  /**
   * 验证安装
   */
  async validateInstallation() {
    const spinner = ora('验证安装...').start();

    try {
      const requiredFiles = [
        path.join(this.aegisDir, 'universal-hook.js'),
        path.join(this.aegisDir, 'rule-engine.js'),
        path.join(this.aegisDir, 'aegis-rules.yaml'),
        path.join(this.aegisDir, 'config.json'),
        path.join(this.claudeConfigDir, 'settings.json')
      ];

      for (const file of requiredFiles) {
        if (!await fs.pathExists(file)) {
          throw new Error(`必需文件不存在: ${file}`);
        }
      }

      // 验证Claude设置
      const settings = await fs.readJson(path.join(this.claudeConfigDir, 'settings.json'));
      if (!settings.preToolUseHook || !settings.preToolUseHook.includes('.aegis')) {
        throw new Error('Claude Code Hook配置不正确');
      }

      spinner.succeed('安装验证通过');
      return true;

    } catch (error) {
      spinner.fail('安装验证失败');
      throw error;
    }
  }

  /**
   * 显示安装摘要
   */
  showInstallationSummary(config, hookInfo) {
    console.log('');
    console.log(chalk.green('🎉 Aegis Security Monitor 安装完成!'));
    console.log('');
    console.log(chalk.cyan('📍 配置信息:'));
    console.log(`   配置目录: ${chalk.yellow(this.aegisDir)}`);
    console.log(`   Hook文件: ${chalk.yellow(hookInfo.hookPath)}`);
    console.log(`   Claude配置: ${chalk.yellow(hookInfo.settingsFile)}`);
    console.log('');
    console.log(chalk.cyan('🚀 服务配置:'));
    console.log(`   后端端口: ${chalk.yellow(config.backend.port)}`);
    console.log(`   前端端口: ${chalk.yellow(config.frontend.port)}`);
    console.log('');
    console.log(chalk.cyan('📋 下一步:'));
    console.log(`   运行 ${chalk.green('aegis start')} 启动服务`);
    console.log(`   访问 ${chalk.green(`http://localhost:${config.frontend.port}`)} 查看界面`);
    console.log('');

    if (hookInfo.backupCreated) {
      console.log(chalk.gray('💾 原Claude配置已备份到 ~/.aegis/backup/'));
    }
  }

  /**
   * 运行命令的辅助函数
   */
  runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`🔧 执行命令: ${command} ${args.join(' ')}`);

      const child = spawn(command, args, {
        stdio: 'inherit', // 改为inherit，直接显示输出
        ...options
      });

      let stdout = '';
      let stderr = '';

      // 如果需要捕获输出，使用pipe模式
      if (options.captureOutput) {
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
          console.error(`❌ ${data.toString()}`);
        });
      }

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          const errorMsg = stderr || `命令失败，退出码: ${code}`;
          console.error(`❌ 命令执行失败: ${command} ${args.join(' ')}`);
          console.error(`❌ 错误信息: ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      });

      child.on('error', (error) => {
        console.error(`❌ 进程错误: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * 重置安装（用于config --reset）
   */
  async resetInstallation() {
    const spinner = ora('重置Aegis配置...').start();

    try {
      // 移除Aegis目录
      if (await fs.pathExists(this.aegisDir)) {
        await fs.remove(this.aegisDir);
      }

      // 恢复Claude设置（如果有备份）
      const claudeSettings = path.join(this.claudeConfigDir, 'settings.json');
      if (await fs.pathExists(claudeSettings)) {
        const settings = await fs.readJson(claudeSettings);
        if (settings.preToolUseHook && settings.preToolUseHook.includes('.aegis')) {
          delete settings.preToolUseHook;
          await fs.writeJson(claudeSettings, settings, { spaces: 2 });
        }
      }

      spinner.succeed('配置重置完成');

    } catch (error) {
      spinner.fail('配置重置失败');
      throw error;
    }
  }
}

module.exports = AegisSetupUtils;