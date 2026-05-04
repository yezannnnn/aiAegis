#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('cross-spawn');
const os = require('os');

const program = new Command();
const packageJson = require('../package.json');

// 用户数据目录
const AEGIS_HOME = process.env.AEGIS_HOME || path.join(os.homedir(), '.aegis');
const RULES_DIR = path.join(AEGIS_HOME, 'rules');
const DATA_DIR = path.join(AEGIS_HOME, 'data');
const CONFIG_PATH = path.join(AEGIS_HOME, 'config.json');

// 包内目录（只读）
const PACKAGE_DIR = path.join(__dirname, '..');
const BACKEND_DIST = path.join(PACKAGE_DIR, 'backend', 'dist');
const FRONTEND_DIST = path.join(PACKAGE_DIR, 'frontend', 'dist');
const DEFAULT_RULES = path.join(PACKAGE_DIR, 'default-rules');

program
  .name('aegis')
  .description('🛡️ Aegis AI Security Monitor CLI')
  .version(packageJson.version);

// ========== init 命令 ==========
program
  .command('init')
  .description('初始化 Aegis 配置目录')
  .action(async () => {
    console.log(chalk.cyan('🛡️ 初始化 Aegis Security Monitor'));
    console.log(chalk.gray('================================='));

    try {
      // 创建用户目录
      await fs.ensureDir(AEGIS_HOME);
      await fs.ensureDir(RULES_DIR);
      await fs.ensureDir(DATA_DIR);

      // 复制默认规则（如果用户目录为空）
      const userRules = await fs.readdir(RULES_DIR).catch(() => []);
      if (userRules.length === 0 && await fs.pathExists(DEFAULT_RULES)) {
        await fs.copy(DEFAULT_RULES, RULES_DIR);
        console.log(chalk.green('✅ 默认规则已复制到 ~/.aegis/rules/'));
      }

      // 创建默认配置
      const config = {
        version: packageJson.version,
        setupDate: new Date().toISOString(),
        backend: { port: 3001, host: 'localhost' },
        frontend: { port: 5173, host: 'localhost' },
        directories: {
          home: AEGIS_HOME,
          rules: RULES_DIR,
          data: DATA_DIR
        }
      };
      await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });

      console.log(chalk.green('✅ 初始化完成'));
      console.log(chalk.gray(`配置目录: ${AEGIS_HOME}`));
      console.log(chalk.gray(`规则目录: ${RULES_DIR}`));
      console.log(chalk.yellow('\n💡 运行 aegis start 启动服务'));

    } catch (error) {
      console.error(chalk.red('❌ 初始化失败:'), error.message);
      process.exit(1);
    }
  });

// ========== start 命令 ==========
program
  .command('start')
  .description('启动 Aegis 前后端服务')
  .option('-p, --port <port>', '后端端口', '3001')
  .option('-f, --frontend-port <port>', '前端端口', '5173')
  .option('--backend-only', '仅启动后端')
  .option('--frontend-only', '仅启动前端')
  .action(async (options) => {
    // 检查是否已初始化
    if (!await fs.pathExists(AEGIS_HOME)) {
      console.log(chalk.yellow('⚠️  未初始化，正在自动初始化...'));
      await program.commands.find(c => c.name() === 'init')._actionHandler();
    }

    console.log(chalk.cyan('🚀 启动 Aegis Security Monitor'));
    console.log(chalk.gray('================================'));

    const processes = [];

    // 启动后端
    if (!options.frontendOnly) {
      if (!await fs.pathExists(BACKEND_DIST)) {
        console.error(chalk.red('❌ 后端编译产物不存在，请重新安装 aegis'));
        process.exit(1);
      }

      console.log(chalk.blue('🔧 启动后端服务...'));
      const backendProcess = spawn('node', [path.join(BACKEND_DIST, 'main.js')], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: options.port,
          AEGIS_RULES_DIR: RULES_DIR,
          AEGIS_DATA_DIR: DATA_DIR,
          AEGIS_CONFIG: CONFIG_PATH,
          FRONTEND_URL: `http://localhost:${options.frontendPort}`
        }
      });
      processes.push(backendProcess);

      // 等待后端启动
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 启动前端
    if (!options.backendOnly) {
      if (!await fs.pathExists(FRONTEND_DIST)) {
        console.error(chalk.red('❌ 前端编译产物不存在，请重新安装 aegis'));
        process.exit(1);
      }

      console.log(chalk.blue('🖥️  启动前端服务...'));
      const frontendProcess = spawn('npx', [
        'serve', '-s', FRONTEND_DIST,
        '-l', options.frontendPort,
        '--cors'
      ], {
        stdio: 'inherit',
        env: { ...process.env }
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
      console.log(chalk.white('   🖥️  前端界面: ') + chalk.cyan(`http://localhost:${options.frontendPort}`));
    }
    console.log('');
    console.log(chalk.yellow('按 Ctrl+C 停止服务'));

    // 处理退出信号
    process.on('SIGINT', () => {
      console.log('\n🛑 正在停止服务...');
      processes.forEach(proc => proc.kill('SIGTERM'));
      setTimeout(() => process.exit(0), 500);
    });

    // 等待进程
    await Promise.all(processes.map(proc => new Promise(resolve => proc.on('exit', resolve))));
  });

// ========== rules 命令 ==========
program
  .command('rules')
  .description('规则管理')
  .option('list', '列出所有规则')
  .option('add <file>', '添加自定义规则')
  .option('remove <name>', '删除规则')
  .action(async (arg, options) => {
    // 确保目录存在
    await fs.ensureDir(RULES_DIR);

    const subcommand = options.args?.[0] || 'list';

    if (subcommand === 'list') {
      const rules = (await fs.readdir(RULES_DIR).catch(() => []))
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      console.log(chalk.cyan('📋 规则列表'));
      console.log(chalk.gray('============'));
      if (rules.length === 0) {
        console.log(chalk.gray('暂无规则'));
      } else {
        rules.forEach(r => console.log(`  • ${chalk.yellow(r)}`));
      }
      console.log(chalk.gray(`\n规则目录: ${RULES_DIR}`));
    }

    if (subcommand === 'add') {
      const srcFile = options.args?.[1];
      if (!srcFile) {
        console.error(chalk.red('❌ 请指定规则文件路径'));
        process.exit(1);
      }
      const srcPath = path.resolve(srcFile);
      if (!await fs.pathExists(srcPath)) {
        console.error(chalk.red(`❌ 文件不存在: ${srcPath}`));
        process.exit(1);
      }
      const destPath = path.join(RULES_DIR, path.basename(srcPath));
      await fs.copy(srcPath, destPath);
      console.log(chalk.green(`✅ 规则已添加: ${path.basename(srcPath)}`));
    }

    if (subcommand === 'remove') {
      const name = options.args?.[1];
      if (!name) {
        console.error(chalk.red('❌ 请指定规则文件名'));
        process.exit(1);
      }
      const filePath = path.join(RULES_DIR, name);
      if (!await fs.pathExists(filePath)) {
        console.error(chalk.red(`❌ 规则不存在: ${name}`));
        process.exit(1);
      }
      await fs.remove(filePath);
      console.log(chalk.green(`✅ 规则已删除: ${name}`));
    }
  });

// ========== status 命令 ==========
program
  .command('status')
  .description('检查 Aegis 服务状态')
  .action(async () => {
    console.log(chalk.cyan('🔍 Aegis 服务状态'));
    console.log(chalk.gray('=================='));

    const checkPort = async (port) => {
      try {
        const response = await fetch(`http://localhost:${port}/api/monitoring/health`);
        return response.ok;
      } catch {
        return false;
      }
    };

    const backendStatus = await checkPort(3001);
    const frontendStatus = await checkPort(5173);

    console.log(`🔧 后端服务: ${backendStatus ? chalk.green('✅ 运行中') : chalk.red('❌ 未运行')}`);
    console.log(`🖥️  前端服务: ${frontendStatus ? chalk.green('✅ 运行中') : chalk.red('❌ 未运行')}`);

    if (!backendStatus && !frontendStatus) {
      console.log('\n💡 提示: 运行 ' + chalk.cyan('aegis start') + ' 启动服务');
    }
  });

// ========== config 命令 ==========
program
  .command('config')
  .description('查看配置')
  .action(async () => {
    if (!await fs.pathExists(CONFIG_PATH)) {
      console.log(chalk.yellow('⚠️  未初始化，请先运行 aegis init'));
      return;
    }
    const config = await fs.readJson(CONFIG_PATH);
    console.log(chalk.cyan('📋 当前配置'));
    console.log(chalk.gray('============='));
    console.log(JSON.stringify(config, null, 2));
  });

program.parse();
