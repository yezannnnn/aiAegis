const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const chalk = require('chalk');

const AEGIS_HOME = path.join(os.homedir(), '.aegis');
const RULES_DIR = path.join(AEGIS_HOME, 'rules');
const DATA_DIR = path.join(AEGIS_HOME, 'data');
const CONFIG_PATH = path.join(AEGIS_HOME, 'config.json');

const PACKAGE_DIR = path.join(__dirname, '..');
const DEFAULT_RULES = path.join(PACKAGE_DIR, 'default-rules');

async function postInstall() {
  console.log(chalk.cyan('🛡️  Aegis Security Monitor - Post Install'));
  console.log(chalk.gray('=========================================='));

  try {
    // 创建用户目录
    await fs.ensureDir(AEGIS_HOME);
    await fs.ensureDir(RULES_DIR);
    await fs.ensureDir(DATA_DIR);

    // 复制默认规则
    const userRules = await fs.readdir(RULES_DIR).catch(() => []);
    if (userRules.length === 0 && await fs.pathExists(DEFAULT_RULES)) {
      await fs.copy(DEFAULT_RULES, RULES_DIR);
      console.log(chalk.green('✅ 默认规则已复制到 ~/.aegis/rules/'));
    }

    // 创建默认配置
    const config = {
      version: require('../package.json').version,
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

    console.log(chalk.green('✅ Aegis 初始化完成'));
    console.log(chalk.gray(`配置目录: ${AEGIS_HOME}`));
    console.log(chalk.yellow('
💡 运行 aegis start 启动服务'));

  } catch (error) {
    console.error(chalk.red('❌ 初始化失败:'), error.message);
    process.exit(1);
  }
}

postInstall();
