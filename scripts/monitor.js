#!/usr/bin/env node

/**
 * Aegis Monitor Script - npm run monitor
 */

const { execSync } = require('child_process');

function openMonitor() {
  const url = 'http://localhost:3001';

  console.log('🌐 打开 Aegis 监控界面');
  console.log('========================');

  try {
    const command = process.platform === 'win32' ? 'start' :
                   process.platform === 'darwin' ? 'open' : 'xdg-open';

    execSync(`${command} ${url}`, { stdio: 'ignore' });
    console.log('✅ 监控界面已打开:', url);

  } catch (error) {
    console.log('⚠️  请手动打开监控界面:', url);
    console.log('');
    console.log('💡 如果页面无法访问，请先运行: npm start');
  }
}

if (require.main === module) {
  openMonitor();
}

module.exports = openMonitor;