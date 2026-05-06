#!/usr/bin/env node

/**
 * Aegis Stop Script - npm stop
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function stopAegis() {
  const pidFile = path.join(os.homedir(), '.aegis', 'server.pid');

  console.log('🛑 停止 Aegis 服务');
  console.log('==================');

  if (!fs.existsSync(pidFile)) {
    console.log('⚠️  服务未运行');
    return;
  }

  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(pidFile);
    console.log('✅ 服务已停止');
  } catch (error) {
    console.log('⚠️  停止服务时出错:', error.message);
    // 清理PID文件
    try {
      fs.unlinkSync(pidFile);
    } catch (e) {
      // 静默处理
    }
  }
}

if (require.main === module) {
  stopAegis();
}

module.exports = stopAegis;