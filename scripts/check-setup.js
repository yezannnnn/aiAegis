#!/usr/bin/env node

/**
 * Aegis Pre-start Check - npm run prestart
 * 启动前自动检查配置
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function checkSetup() {
  const aegisDir = path.join(os.homedir(), '.aegis');
  const configFile = path.join(aegisDir, 'config.json');

  if (!fs.existsSync(configFile)) {
    console.log('⚠️  检测到未配置，自动运行安装...');
    console.log('');

    // 自动运行setup
    const setupScript = path.join(__dirname, 'setup.js');
    require(setupScript);
  } else {
    console.log('✅ 配置检查通过');
  }
}

if (require.main === module) {
  checkSetup();
}

module.exports = checkSetup;