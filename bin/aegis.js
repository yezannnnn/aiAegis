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
  .description('Initialize and configure Aegis security monitoring')
  .option('--skip-deps', 'Skip dependency installation')
  .option('--port <port>', 'Backend port', '3001')
  .option('--skip-hook', 'Skip Claude Code Hook configuration')
  .action(async (options) => {
    console.log(chalk.cyan('🛡️ Aegis Security Monitor Setup'));
    console.log(chalk.gray('====================================='));

    const setupUtils = new AegisSetupUtils();

    try {
      await setupUtils.createDirectories();
      await setupUtils.copySystemFiles();

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
          message: 'Set up Claude Code Hook for automatic interception?',
          default: true
        }]);
        if (setupHook) {
          hookInfo = await setupUtils.setupClaudeCodeHook();
        }
      }

      const { setupHermes } = await inquirer.prompt([{
        type: 'confirm',
        name: 'setupHermes',
        message: 'Set up Hermes Plugin Hook for automatic interception?',
        default: true
      }]);
      if (setupHermes) {
        hermesHookInfo = await setupUtils.setupHermesHook();
      }

      const config = await setupUtils.createSystemConfig({ port: options.port });
      await setupUtils.validateInstallation();
      setupUtils.showInstallationSummary(config, hookInfo, hermesHookInfo);

    } catch (error) {
      console.error(chalk.red('❌ Setup failed:'), error.message);
      process.exit(1);
    }
  });

// ============================================================
// start — single process: node dist/main (NestJS serves frontend statics)
// ============================================================
program
  .command('start')
  .description('Start Aegis (all-in-one, single process)')
  .option('-p, --port <port>', 'Port', '3001')
  .action(async (options) => {
    console.log(chalk.cyan('🚀 Starting Aegis Security Monitor'));
    console.log(chalk.gray('===================================='));

    const configFile = path.join(AEGIS_HOME, 'config.json');
    if (await fs.pathExists(configFile)) {
      const config = await fs.readJson(configFile);
      config.ports = config.ports || {};
      config.ports.webInterface = parseInt(options.port);
      await fs.writeJson(configFile, config, { spaces: 2 });
    }

    const distMain = path.join(BACKEND_DIR, 'dist', 'main.js');
    if (!await fs.pathExists(distMain)) {
      console.error(chalk.red('❌ Build artifact not found: backend/dist/main.js'));
      console.error(chalk.yellow('💡 Run first: aegis build'));
      process.exit(1);
    }

    const backendNodeModules = path.join(BACKEND_DIR, 'node_modules');
    if (!await fs.pathExists(backendNodeModules)) {
      console.log(chalk.yellow('⚠️  Backend dependencies not found, installing...'));
      try {
        const { execSync: exec } = require('child_process');
        exec('npm install --production --legacy-peer-deps --no-audit --no-fund', {
          cwd: BACKEND_DIR, stdio: 'inherit', timeout: 300000
        });
      } catch (e) {
        console.error(chalk.red('❌ Dependency installation failed. Run manually: cd ' + BACKEND_DIR + ' && npm install --production'));
        process.exit(1);
      }
    }

    const dataDir = path.join(AEGIS_HOME, 'data');
    await fs.ensureDir(dataDir);
    const sqlitePath = path.join(dataDir, 'aegis.db');

    console.log(chalk.blue('🔧 Starting service...'));
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
    console.log(chalk.green('✅ Service started:'));
    console.log(chalk.white('   🖥️  Dashboard: ') + chalk.cyan(`http://localhost:${options.port}`));
    console.log(chalk.white('   📚 API Docs:   ') + chalk.cyan(`http://localhost:${options.port}/api`));
    console.log('');
    console.log(chalk.yellow('Press Ctrl+C to stop'));

    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping...');
      proc.kill();
      process.exit(0);
    });

    await new Promise(resolve => proc.on('exit', resolve));
  });

// ============================================================
// build
// ============================================================
program
  .command('build')
  .description('Build frontend + backend')
  .action(async () => {
    const root = path.join(__dirname, '..');

    console.log(chalk.cyan('🔨 Building Aegis...'));
    console.log('');

    const backendSpinner = ora('Compiling backend TypeScript...').start();
    try {
      execSync('npm install --legacy-peer-deps --no-audit --no-fund', {
        cwd: path.join(root, 'backend'),
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'development' },
      });
      execSync('./node_modules/.bin/nest build', { cwd: path.join(root, 'backend'), stdio: 'pipe' });
      execSync('cp src/rules/*.yaml dist/rules/ 2>/dev/null || true', {
        cwd: path.join(root, 'backend'),
        shell: true,
        stdio: 'pipe'
      });
      backendSpinner.succeed('Backend compiled');
    } catch (e) {
      backendSpinner.fail('Backend compilation failed');
      console.error(e.stderr?.toString() || e.message);
      process.exit(1);
    }

    const frontendSpinner = ora('Building frontend Vue...').start();
    try {
      execSync('npm run build', { cwd: path.join(root, 'frontend'), stdio: 'pipe' });
      frontendSpinner.succeed('Frontend built');
    } catch (e) {
      frontendSpinner.fail('Frontend build failed');
      console.error(e.stderr?.toString() || e.message);
      process.exit(1);
    }

    console.log('');
    console.log(chalk.green('✅ Build complete. Run aegis start'));
  });

// ============================================================
// rules
// ============================================================
const rulesCmd = program.command('rules').description('Manage custom security rules');

rulesCmd
  .command('list')
  .description('List all active rules (built-in + user)')
  .action(async () => {
    try {
      const data = await apiGet('http://localhost:3001/api/v1/rules');
      const info = await apiGet('http://localhost:3001/api/v1/rules/info');

      console.log(chalk.cyan('📋 Aegis Rule List'));
      console.log(chalk.gray(`Total: ${data.count} rules\n`));

      if (info) {
        console.log(`  Built-in: ${chalk.white(info.bySource['built-in'])} rules`);
        console.log(`  User:     ${chalk.green(info.bySource['user'])} rules  (${info.userRulesDir})`);
        console.log(`  Project:  ${chalk.yellow(info.bySource['project'])} rules  (./.aegis/rules/)`);
        console.log('');
      }

      const bySource = {};
      for (const rule of data.rules) {
        const src = rule._source || 'built-in';
        if (!bySource[src]) bySource[src] = [];
        bySource[src].push(rule);
      }

      const sourceLabels = {
        'built-in': chalk.gray('[built-in]'),
        'user':     chalk.green('[user]'),
        'project':  chalk.yellow('[project]'),
      };

      for (const [src, rules] of Object.entries(bySource)) {
        console.log(sourceLabels[src] || `[${src}]`);
        for (const rule of rules) {
          const actionColor = rule.action === 'block' ? chalk.red : rule.action === 'review' ? chalk.yellow : chalk.green;
          const exampleStr = (rule.example || '—').padEnd(45);
          const reason = rule.reason;
          const reasonStr = typeof reason === 'object'
            ? (reason.en || reason.zh || '')
            : (reason || '');
          console.log(`  ${chalk.white(rule.id?.padEnd(40))} ${actionColor(rule.action?.padEnd(8))} ${chalk.cyan(exampleStr)} ${chalk.gray(reasonStr)}`);
        }
        console.log('');
      }
    } catch (e) {
      console.error(chalk.red('❌ Cannot connect to Aegis service. Run aegis start first'));
    }
  });

rulesCmd
  .command('new <name>')
  .description('Create a new rule file template (global by default, --project for current project)')
  .option('--project', 'Write to current project .aegis/rules/ directory (can be committed to git)')
  .action(async (name, options) => {
    const targetDir = options.project
      ? path.join(process.cwd(), '.aegis', 'rules')
      : USER_RULES_DIR;
    await fs.ensureDir(targetDir);
    const filename = name.endsWith('.yaml') ? name : `${name}.yaml`;
    const dest = path.join(targetDir, filename);

    if (await fs.pathExists(dest)) {
      console.log(chalk.yellow(`⚠️  File already exists: ${dest}`));
      return;
    }

    const template = `name: "${name}"
version: "1.0"

rules:
  # Example: block a dangerous operation
  - id: ${name}/example-block
    description: "Example: block dangerous operation"
    example: "rm -rf important-dir/"
    category: "custom"
    severity: "block"
    action: "block"
    reason:
      en: "Explain why this should be blocked"
      zh: "说明为什么要阻止"
    conditions:
      binary: "rm"
      argumentPatterns:
        - "important-dir/"

  # Example: require approval before execution
  - id: ${name}/example-review
    description: "Example: operation requires approval"
    example: "./deploy.sh prod"
    category: "custom"
    severity: "error"
    action: "review"
    reason:
      en: "Explain why this needs approval"
      zh: "说明为什么需要审批"
    conditions:
      binary: "sh"
      argumentPatterns:
        - "deploy"
`;

    await fs.writeFile(dest, template, 'utf8');
    console.log(chalk.green(`✅ Rule file created: ${dest}`));
    if (options.project) {
      console.log(chalk.yellow('📁 Project-level rule — consider committing to git'));
    } else {
      console.log(chalk.gray('🌍 Global rule — applies to all projects'));
    }
    console.log(chalk.gray('Edit the file then run `aegis rules reload` to apply'));
  });

rulesCmd
  .command('path')
  .description('Show user rules directory path')
  .action(() => {
    console.log(chalk.cyan('User rules directories:'));
    console.log(`  Global:  ${chalk.white(USER_RULES_DIR)}`);
    console.log(`  Project: ${chalk.white('<cwd>/.aegis/rules/')}`);
    console.log('');
    console.log(chalk.gray('Global rules apply to all projects. Project rules apply only to the current project (committable to git).'));
  });

rulesCmd
  .command('reload')
  .description('Hot-reload all rules (no restart required)')
  .action(async () => {
    const spinner = ora('Reloading rules...').start();
    try {
      const result = await apiPost('http://localhost:3001/api/v1/rules/reload', {});
      spinner.succeed('Rules reloaded');
      if (result?.summary) {
        const s = result.summary;
        console.log(`  Total: ${s.total}  (built-in ${s.bySource['built-in']} + user ${s.bySource['user']} + project ${s.bySource['project']})`);
      }
    } catch (e) {
      spinner.fail('Reload failed — make sure Aegis service is running');
    }
  });

// ============================================================
// status
// ============================================================
program
  .command('status')
  .description('Check Aegis service status')
  .action(async () => {
    console.log(chalk.cyan('🔍 Aegis Service Status'));
    console.log(chalk.gray('======================='));
    try {
      const info = await apiGet('http://localhost:3001/api/v1/rules/info');
      console.log(`Service: ${chalk.green('✅ Running')}`);
      console.log(`Rules:   ${info.total} rules (built-in ${info.bySource['built-in']} / user ${info.bySource['user']})`);
      console.log(`Dashboard: ${chalk.cyan('http://localhost:3001')}`);
    } catch {
      console.log(`Service: ${chalk.red('❌ Not running')}`);
      console.log('💡 Run ' + chalk.cyan('aegis start') + ' to start the service');
    }
  });

// ============================================================
// config
// ============================================================
program
  .command('config')
  .description('Configuration management')
  .option('--list', 'List current configuration')
  .option('--reset', 'Reset configuration')
  .action(async (options) => {
    const setupUtils = new AegisSetupUtils();

    if (options.list) {
      try {
        const configFile = path.join(AEGIS_HOME, 'config.json');
        if (await fs.pathExists(configFile)) {
          const config = await fs.readJson(configFile);
          console.log(chalk.cyan('📋 Current Configuration'));
          console.log(`Version:    ${chalk.yellow(config.version)}`);
          console.log(`Port:       ${chalk.yellow(config.ports?.webInterface || 3001)}`);
          console.log(`Config dir: ${chalk.yellow(AEGIS_HOME)}`);
          console.log(`User rules: ${chalk.yellow(USER_RULES_DIR)}`);
        } else {
          console.log(chalk.yellow('⚠️  No configuration found. Run aegis setup'));
        }
      } catch (e) {
        console.error(chalk.red('❌ Failed to read configuration'));
      }
    }

    if (options.reset) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Reset all configuration?',
        default: false
      }]);
      if (confirm) {
        try {
          await setupUtils.resetInstallation();
          console.log(chalk.green('✅ Configuration reset. Run aegis setup to reinitialize'));
        } catch (e) {
          console.error(chalk.red('❌ Reset failed:'), e.message);
        }
      }
    }
  });

// ============================================================
// Helper: HTTP requests
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
