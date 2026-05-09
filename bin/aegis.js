#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('cross-spawn');
const { execSync } = require('child_process');
const inquirer = require('inquirer');
const http = require('http');
const AegisSetupUtils = require('./setup-utils');

const program = new Command();
const packageJson = require('../package.json');

const AEGIS_HOME = process.env.AEGIS_HOME || path.join(require('os').homedir(), '.aegis');
const BACKEND_DIR = path.join(__dirname, '../backend');
const USER_RULES_DIR = path.join(AEGIS_HOME, 'rules');

program
  .name('aegis')
  .description('🛡️ Aegis AI Security Monitor CLI')
  .version(packageJson.version);

// ============================================================
// setup
// ============================================================
program
  .command('setup')
  .description('初始化和配置 Aegis 安全监控系统')
  .option('--skip-deps', '跳过依赖安装')
  .option('--port <port>', '指定后端端口', '3001')
  .option('--skip-hook', '跳过 Claude Code Hook 配置')
  .action(async (options) => {
    console.log(chalk.cyan('🛡️ Aegis Security Monitor Setup'));
    console.log(chalk.gray('====================================='));

    const setupUtils = new AegisSetupUtils();

    try {
      await setupUtils.createDirectories();
      await setupUtils.copySystemFiles();

      // 依赖安装由 npm postinstall 自动完成；若未安装则补跑一次
      if (!options.skipDeps) {
        const backendMods = path.join(__dirname, '../backend/node_modules');
        const fse = require('fs-extra');
        if (!await fse.pathExists(backendMods)) {
          await setupUtils.installDependencies();
        }
      }

      let hookInfo = null;
      let hermesHookInfo = null;

      if (!options.skipHook) {
        const { setupHook } = await inquirer.prompt([{
          type: 'confirm',
          name: 'setupHook',
          message: '是否配置 Claude Code Hook 自动拦截？',
          default: true
        }]);
        if (setupHook) {
          hookInfo = await setupUtils.setupClaudeCodeHook();
        }
      }

      // 新增：Hermes Plugin Hook 配置
      const { setupHermes } = await inquirer.prompt([{
        type: 'confirm',
        name: 'setupHermes',
        message: '是否配置 Hermes Plugin Hook 自动拦截？',
        default: true
      }]);
      if (setupHermes) {
        hermesHookInfo = await setupUtils.setupHermesHook();
      }

      const config = await setupUtils.createSystemConfig({ port: options.port });
      await setupUtils.validateInstallation();
      setupUtils.showInstallationSummary(config, hookInfo, hermesHookInfo);

    } catch (error) {
      console.error(chalk.red('❌ 设置失败:'), error.message);
      process.exit(1);
    }
  });

// ============================================================
// start — 单进程：node dist/main（NestJS 同时托管前端静态文件）
// ============================================================
program
  .command('start')
  .description('启动 Aegis（后端 + 前端一体化，仅一个进程）')
  .option('-p, --port <port>', '端口', '3001')
  .action(async (options) => {
    console.log(chalk.cyan('🚀 启动 Aegis Security Monitor'));
    console.log(chalk.gray('================================'));

    // 更新 config.json 端口
    const configFile = path.join(AEGIS_HOME, 'config.json');
    if (await fs.pathExists(configFile)) {
      const config = await fs.readJson(configFile);
      config.ports = config.ports || {};
      config.ports.webInterface = parseInt(options.port);
      await fs.writeJson(configFile, config, { spaces: 2 });
    }

    const distMain = path.join(BACKEND_DIR, 'dist', 'main.js');
    if (!await fs.pathExists(distMain)) {
      console.error(chalk.red('❌ 未找到编译产物 backend/dist/main.js'));
      console.error(chalk.yellow('💡 请先运行: aegis build'));
      process.exit(1);
    }

    // 检查 backend/node_modules 是否已安装
    const backendNodeModules = path.join(BACKEND_DIR, 'node_modules');
    if (!await fs.pathExists(backendNodeModules)) {
      console.log(chalk.yellow('⚠️  后端依赖未安装，正在安装...'));
      try {
        const { execSync: exec } = require('child_process');
        exec('npm install --production --legacy-peer-deps --no-audit --no-fund', {
          cwd: BACKEND_DIR, stdio: 'inherit', timeout: 300000
        });
      } catch (e) {
        console.error(chalk.red('❌ 依赖安装失败，请运行: cd ' + BACKEND_DIR + ' && npm install --production'));
        process.exit(1);
      }
    }

    // 数据文件存放在用户主目录（可写，跨版本升级持久化）
    const dataDir = path.join(AEGIS_HOME, 'data');
    await fs.ensureDir(dataDir);
    const sqlitePath = path.join(dataDir, 'aegis.db');

    console.log(chalk.blue('🔧 启动服务...'));
    const proc = spawn('node', ['dist/main.js'], {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: options.port,
        NODE_ENV: 'production',
        SQLITE_PATH: sqlitePath,
      }
    });

    console.log('');
    console.log(chalk.green('✅ 服务已启动:'));
    console.log(chalk.white('   🖥️  监控界面: ') + chalk.cyan(`http://localhost:${options.port}`));
    console.log(chalk.white('   📚 API 文档:  ') + chalk.cyan(`http://localhost:${options.port}/api`));
    console.log('');
    console.log(chalk.yellow('按 Ctrl+C 停止服务'));

    process.on('SIGINT', () => {
      console.log('\n🛑 正在停止...');
      proc.kill();
      process.exit(0);
    });

    await new Promise(resolve => proc.on('exit', resolve));
  });

// ============================================================
// build — 一键构建前后端
// ============================================================
program
  .command('build')
  .description('构建前端 + 后端（发布前或重新编译时运行）')
  .action(async () => {
    const root = path.join(__dirname, '..');

    console.log(chalk.cyan('🔨 构建 Aegis...'));
    console.log('');

    // 构建后端（需要 devDependencies，先确保全量安装）
    const backendSpinner = ora('编译后端 TypeScript...').start();
    try {
      // 确保 @nestjs/cli 等 devDeps 已安装（强制 NODE_ENV=development 避免 publish 时被跳过）
      execSync('npm install --legacy-peer-deps --no-audit --no-fund', {
        cwd: path.join(root, 'backend'),
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'development' },
      });
      // 用本地 nest 二进制，不依赖全局安装
      execSync('./node_modules/.bin/nest build', { cwd: path.join(root, 'backend'), stdio: 'pipe' });
      // 同步 YAML 规则到 dist
      execSync('cp src/rules/*.yaml dist/rules/ 2>/dev/null || true', {
        cwd: path.join(root, 'backend'),
        shell: true,
        stdio: 'pipe'
      });
      backendSpinner.succeed('后端编译完成');
    } catch (e) {
      backendSpinner.fail('后端编译失败');
      console.error(e.stderr?.toString() || e.message);
      process.exit(1);
    }

    // 构建前端
    const frontendSpinner = ora('构建前端 Vue...').start();
    try {
      execSync('npm run build', { cwd: path.join(root, 'frontend'), stdio: 'pipe' });
      frontendSpinner.succeed('前端构建完成');
    } catch (e) {
      frontendSpinner.fail('前端构建失败');
      console.error(e.stderr?.toString() || e.message);
      process.exit(1);
    }

    console.log('');
    console.log(chalk.green('✅ 构建完成，可以运行 aegis start'));
  });

// ============================================================
// rules — 自定义规则管理
// ============================================================
const rulesCmd = program.command('rules').description('管理自定义安全规则');

rulesCmd
  .command('list')
  .description('查看所有生效的规则（内置 + 用户自定义）')
  .action(async () => {
    try {
      const data = await apiGet('http://localhost:3001/api/v1/rules');
      const info = await apiGet('http://localhost:3001/api/v1/rules/info');

      console.log(chalk.cyan('📋 Aegis 规则列表'));
      console.log(chalk.gray(`总计: ${data.count} 条规则\n`));

      if (info) {
        console.log(`  内置规则: ${chalk.white(info.bySource['built-in'])} 条`);
        console.log(`  用户规则: ${chalk.green(info.bySource['user'])} 条  (${info.userRulesDir})`);
        console.log(`  项目规则: ${chalk.yellow(info.bySource['project'])} 条  (./.aegis/rules/)`);
        console.log('');
      }

      // 按来源分组显示
      const bySource = {};
      for (const rule of data.rules) {
        const src = rule._source || 'built-in';
        if (!bySource[src]) bySource[src] = [];
        bySource[src].push(rule);
      }

      const sourceLabels = {
        'built-in': chalk.gray('[内置]'),
        'user': chalk.green('[用户]'),
        'project': chalk.yellow('[项目]'),
      };

      for (const [src, rules] of Object.entries(bySource)) {
        console.log(sourceLabels[src] || `[${src}]`);
        for (const rule of rules) {
          const actionColor = rule.action === 'block' ? chalk.red : rule.action === 'review' ? chalk.yellow : chalk.green;
          const exampleStr = (rule.example || '—').padEnd(45);
          const reasonStr = rule.reason || '';
          console.log(`  ${chalk.white(rule.id?.padEnd(40))} ${actionColor(rule.action?.padEnd(8))} ${chalk.cyan(exampleStr)} ${chalk.gray(reasonStr)}`);
        }
        console.log('');
      }
    } catch (e) {
      console.error(chalk.red('❌ 无法连接到 Aegis 服务，请先运行 aegis start'));
    }
  });

rulesCmd
  .command('new <name>')
  .description('创建新的规则文件模板（默认写入全局用户目录，--project 写入当前项目）')
  .option('--project', '写入当前项目的 .aegis/rules/ 目录（可提交到 git）')
  .action(async (name, options) => {
    const targetDir = options.project
      ? path.join(process.cwd(), '.aegis', 'rules')
      : USER_RULES_DIR;
    await fs.ensureDir(targetDir);
    const filename = name.endsWith('.yaml') ? name : `${name}.yaml`;
    const dest = path.join(targetDir, filename);

    if (await fs.pathExists(dest)) {
      console.log(chalk.yellow(`⚠️  文件已存在: ${dest}`));
      return;
    }

    const template = `name: "${name}"
version: "1.0"

rules:
  # 示例：阻止删除特定目录
  - id: ${name}/example-block
    description: "示例：阻止危险操作"
    example: "rm -rf important-dir/"   # 触发此规则的实际命令示例（不写则自动推断）
    category: "custom"
    severity: "block"
    action: "block"
    reason: "这里写明为什么要阻止"
    conditions:
      binary: "rm"
      argumentPatterns:
        - "important-dir/"

  # 示例：需要审批才能执行
  - id: ${name}/example-review
    description: "示例：需要审批的操作"
    example: "./deploy.sh prod"        # 触发此规则的实际命令示例（不写则自动推断）
    category: "custom"
    severity: "error"
    action: "review"
    reason: "这里写明为什么需要审批"
    conditions:
      binary: "sh"
      argumentPatterns:
        - "deploy"
`;

    await fs.writeFile(dest, template, 'utf8');
    console.log(chalk.green(`✅ 已创建规则文件: ${dest}`));
    if (options.project) {
      console.log(chalk.yellow('📁 项目级规则，建议提交到 git'));
    } else {
      console.log(chalk.gray('🌍 全局规则，对所有项目生效'));
    }
    console.log(chalk.gray('编辑此文件后运行 `aegis rules reload` 使规则生效'));
  });

rulesCmd
  .command('path')
  .description('显示用户规则目录路径')
  .action(() => {
    console.log(chalk.cyan('用户规则目录:'));
    console.log(`  全局: ${chalk.white(USER_RULES_DIR)}`);
    console.log(`  项目: ${chalk.white('<当前目录>/.aegis/rules/')}`);
    console.log('');
    console.log(chalk.gray('全局规则对所有项目生效，项目规则仅对当前项目生效（可提交到 git）'));
  });

rulesCmd
  .command('reload')
  .description('热重载所有规则（无需重启服务）')
  .action(async () => {
    const spinner = ora('重载规则...').start();
    try {
      const result = await apiPost('http://localhost:3001/api/v1/rules/reload', {});
      spinner.succeed('规则已重载');
      if (result?.summary) {
        const s = result.summary;
        console.log(`  总计: ${s.total} 条  (内置 ${s.bySource['built-in']} + 用户 ${s.bySource['user']} + 项目 ${s.bySource['project']})`);
      }
    } catch (e) {
      spinner.fail('重载失败，请确认 Aegis 服务正在运行');
    }
  });

// ============================================================
// status
// ============================================================
program
  .command('status')
  .description('检查 Aegis 服务状态')
  .action(async () => {
    console.log(chalk.cyan('🔍 Aegis 服务状态'));
    console.log(chalk.gray('==================='));
    try {
      const info = await apiGet('http://localhost:3001/api/v1/rules/info');
      console.log(`服务: ${chalk.green('✅ 运行中')}`);
      console.log(`规则: ${info.total} 条 (内置 ${info.bySource['built-in']} / 用户 ${info.bySource['user']})`);
      console.log(`监控界面: ${chalk.cyan('http://localhost:3001')}`);
    } catch {
      console.log(`服务: ${chalk.red('❌ 未运行')}`);
      console.log('💡 运行 ' + chalk.cyan('aegis start') + ' 启动服务');
    }
  });

// ============================================================
// config
// ============================================================
program
  .command('config')
  .description('配置管理')
  .option('--list', '列出当前配置')
  .option('--reset', '重置配置')
  .action(async (options) => {
    const setupUtils = new AegisSetupUtils();

    if (options.list) {
      try {
        const configFile = path.join(AEGIS_HOME, 'config.json');
        if (await fs.pathExists(configFile)) {
          const config = await fs.readJson(configFile);
          console.log(chalk.cyan('📋 当前配置'));
          console.log(`版本: ${chalk.yellow(config.version)}`);
          console.log(`端口: ${chalk.yellow(config.ports?.webInterface || 3001)}`);
          console.log(`配置目录: ${chalk.yellow(AEGIS_HOME)}`);
          console.log(`用户规则: ${chalk.yellow(USER_RULES_DIR)}`);
        } else {
          console.log(chalk.yellow('⚠️ 未找到配置，请运行 aegis setup'));
        }
      } catch (e) {
        console.error(chalk.red('❌ 读取配置失败'));
      }
    }

    if (options.reset) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: '确认重置所有配置？',
        default: false
      }]);
      if (confirm) {
        try {
          await setupUtils.resetInstallation();
          console.log(chalk.green('✅ 配置已重置，请运行 aegis setup 重新初始化'));
        } catch (e) {
          console.error(chalk.red('❌ 重置失败:'), e.message);
        }
      }
    }
  });

// ============================================================
// Helper: HTTP 请求
// ============================================================
function apiGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

function apiPost(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

program.parse();
