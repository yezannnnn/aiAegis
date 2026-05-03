#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('cross-spawn');
const inquirer = require('inquirer');
const AegisSetupUtils = require('./setup-utils');

const program = new Command();
const packageJson = require('../package.json');

// 获取安装目录
const AEGIS_HOME = process.env.AEGIS_HOME || path.join(require('os').homedir(), '.aegis');
const BACKEND_DIR = path.join(__dirname, '../backend');
const FRONTEND_DIR = path.join(__dirname, '../frontend');

program
  .name('aegis')
  .description('🛡️ Aegis AI Security Monitor CLI')
  .version(packageJson.version);

// Setup命令
program
  .command('setup')
  .description('初始化和配置Aegis安全监控系统')
  .option('--skip-deps', '跳过依赖安装')
  .option('--port <port>', '指定后端端口', '3001')
  .option('--frontend-port <port>', '指定前端端口', '5173')
  .option('--skip-hook', '跳过Claude Code Hook配置')
  .action(async (options) => {
    console.log(chalk.cyan('🛡️ Aegis Security Monitor Setup'));
    console.log(chalk.gray('====================================='));

    const setupUtils = new AegisSetupUtils();

    try {
      // 1. 创建配置目录
      await setupUtils.createDirectories();

      // 2. 复制系统文件（Hook、规则引擎等）
      await setupUtils.copySystemFiles();

      // 3. 安装依赖
      if (!options.skipDeps) {
        await setupUtils.installDependencies();
      }

      // 4. 构建项目
      await setupUtils.buildProject();

      // 5. 配置Claude Code Hook
      let hookInfo = null;
      if (!options.skipHook) {
        const { setupHook } = await inquirer.prompt([{
          type: 'confirm',
          name: 'setupHook',
          message: '是否配置Claude Code Hook自动拦截？',
          default: true
        }]);

        if (setupHook) {
          hookInfo = await setupUtils.setupClaudeCodeHook();
        }
      }

      // 6. 创建系统配置
      const config = await setupUtils.createSystemConfig({
        port: options.port,
        frontendPort: options.frontendPort
      });

      // 7. 验证安装
      await setupUtils.validateInstallation();

      // 8. 显示安装摘要
      setupUtils.showInstallationSummary(config, hookInfo || {
        hookPath: path.join(AEGIS_HOME, 'universal-hook.js'),
        settingsFile: path.join(require('os').homedir(), '.config', 'claude-code', 'settings.json'),
        backupCreated: false
      });

    } catch (error) {
      console.error(chalk.red('❌ 设置失败:'), error.message);
      console.error(chalk.gray('详细错误:'), error);
      process.exit(1);
    }
  });

// Start命令
program
  .command('start')
  .description('启动Aegis前后端服务')
  .option('-p, --port <port>', '后端端口', '3001')
  .option('-f, --frontend-port <port>', '前端端口', '5173')
  .option('--backend-only', '仅启动后端')
  .option('--frontend-only', '仅启动前端')
  .action(async (options) => {
    console.log(chalk.cyan('🚀 启动 Aegis Security Monitor'));
    console.log(chalk.gray('================================'));

    try {
      const processes = [];

      // 启动后端
      if (!options.frontendOnly) {
        console.log(chalk.blue('🔧 启动后端服务...'));
        const backendProcess = spawn('npm', ['run', 'start:dev'], {
          cwd: BACKEND_DIR,
          stdio: 'inherit',
          env: { ...process.env, PORT: options.port }
        });
        processes.push(backendProcess);

        // 等待后端启动
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // 启动前端
      if (!options.backendOnly) {
        console.log(chalk.blue('🖥️ 启动前端服务...'));
        const frontendProcess = spawn('npm', ['run', 'dev'], {
          cwd: FRONTEND_DIR,
          stdio: 'inherit',
          env: { ...process.env, PORT: options.frontendPort }
        });
        processes.push(frontendProcess);
      }

      console.log('');
      console.log(chalk.green('✅ 服务已启动:'));
      if (!options.frontendOnly) {
        console.log(chalk.white('   🔧 后端API: ') + chalk.cyan(`http://localhost:${options.port}`));
        console.log(chalk.white('   📚 API文档: ') + chalk.cyan(`http://localhost:${options.port}/api`));
      }
      if (!options.backendOnly) {
        console.log(chalk.white('   🖥️ 前端界面: ') + chalk.cyan(`http://localhost:${options.frontendPort}`));
      }
      console.log('');
      console.log(chalk.yellow('按 Ctrl+C 停止服务'));

      // 处理退出信号
      process.on('SIGINT', () => {
        console.log('\n🛑 正在停止服务...');
        processes.forEach(proc => proc.kill());
        process.exit(0);
      });

      // 等待进程
      await Promise.all(processes.map(proc => new Promise(resolve => proc.on('exit', resolve))));

    } catch (error) {
      console.error(chalk.red('❌ 启动失败:'), error.message);
      process.exit(1);
    }
  });

// Status命令
program
  .command('status')
  .description('检查Aegis服务状态')
  .action(async () => {
    console.log(chalk.cyan('🔍 Aegis服务状态检查'));
    console.log(chalk.gray('======================='));

    const checkPort = async (port, service) => {
      try {
        const response = await fetch(`http://localhost:${port}/api/health`);
        return response.ok;
      } catch {
        return false;
      }
    };

    const backendStatus = await checkPort(3001, 'Backend');
    const frontendStatus = await checkPort(5173, 'Frontend');

    console.log(`🔧 后端服务: ${backendStatus ? chalk.green('✅ 运行中') : chalk.red('❌ 未运行')}`);
    console.log(`🖥️ 前端服务: ${frontendStatus ? chalk.green('✅ 运行中') : chalk.red('❌ 未运行')}`);

    if (!backendStatus && !frontendStatus) {
      console.log('\n💡 提示: 运行 ' + chalk.cyan('aegis start') + ' 启动服务');
    }
  });

// Config命令
program
  .command('config')
  .description('配置管理')
  .option('--list', '列出当前配置')
  .option('--reset', '重置配置')
  .option('--show-hook', '显示Hook配置状态')
  .action(async (options) => {
    const setupUtils = new AegisSetupUtils();

    if (options.list) {
      console.log(chalk.cyan('📋 当前配置'));
      console.log(chalk.gray('============='));

      try {
        const configFile = path.join(AEGIS_HOME, 'config.json');
        if (await fs.pathExists(configFile)) {
          const config = await fs.readJson(configFile);

          console.log(`版本: ${chalk.yellow(config.version)}`);
          console.log(`安装时间: ${chalk.yellow(config.setupDate)}`);
          console.log(`配置目录: ${chalk.yellow(AEGIS_HOME)}`);
          console.log(`规则目录: ${chalk.yellow(config.directories.rules)}`);
          console.log(`日志目录: ${chalk.yellow(config.directories.logs)}`);
          console.log(`后端端口: ${chalk.yellow(config.backend.port)}`);
          console.log(`前端端口: ${chalk.yellow(config.frontend.port)}`);
          console.log('');
          console.log('功能状态:');
          console.log(`  Claude Hook: ${config.features.claudeHookEnabled ? chalk.green('✅ 启用') : chalk.red('❌ 禁用')}`);
          console.log(`  实时监控: ${config.features.realTimeMonitoring ? chalk.green('✅ 启用') : chalk.red('❌ 禁用')}`);
          console.log(`  审批系统: ${config.features.approvalSystem ? chalk.green('✅ 启用') : chalk.red('❌ 禁用')}`);

        } else {
          console.log(chalk.yellow('⚠️ 未找到配置文件，请运行 aegis setup'));
        }
      } catch (error) {
        console.error(chalk.red('❌ 读取配置失败:'), error.message);
      }
    }

    if (options.showHook) {
      console.log(chalk.cyan('🔗 Hook配置状态'));
      console.log(chalk.gray('=================='));

      try {
        const claudeSettings = path.join(require('os').homedir(), '.config', 'claude-code', 'settings.json');
        const hookFile = path.join(AEGIS_HOME, 'universal-hook.js');

        console.log(`Hook文件: ${await fs.pathExists(hookFile) ? chalk.green('✅ 存在') : chalk.red('❌ 不存在')}`);
        console.log(`Claude配置: ${await fs.pathExists(claudeSettings) ? chalk.green('✅ 存在') : chalk.red('❌ 不存在')}`);

        if (await fs.pathExists(claudeSettings)) {
          const settings = await fs.readJson(claudeSettings);
          const hookConfigured = settings.preToolUseHook && settings.preToolUseHook.includes('.aegis');
          console.log(`Hook配置: ${hookConfigured ? chalk.green('✅ 已配置') : chalk.red('❌ 未配置')}`);

          if (hookConfigured) {
            console.log(`Hook路径: ${chalk.yellow(settings.preToolUseHook)}`);
          }
        }
      } catch (error) {
        console.error(chalk.red('❌ 检查Hook状态失败:'), error.message);
      }
    }

    if (options.reset) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: '确认重置所有配置？这将删除现有配置文件和Claude Hook设置',
        default: false
      }]);

      if (confirm) {
        try {
          await setupUtils.resetInstallation();
          console.log(chalk.green('✅ 配置已重置'));
          console.log(chalk.yellow('💡 请运行 aegis setup 重新配置系统'));
        } catch (error) {
          console.error(chalk.red('❌ 重置失败:'), error.message);
        }
      }
    }
  });

// 辅助函数
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe', ...options });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}


program.parse();