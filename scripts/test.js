#!/usr/bin/env node

/**
 * Aegis Test Script - npm test
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function testAegis() {
  console.log('🧪 Aegis 功能测试');
  console.log('==================');
  console.log('');

  const aegisDir = path.join(os.homedir(), '.aegis');
  const hookFile = path.join(aegisDir, 'claude-hook.js');

  // 检查安装
  if (!fs.existsSync(hookFile)) {
    console.log('❌ Hook文件未找到');
    console.log('💡 请先运行: npm run setup');
    return;
  }

  console.log('✅ Hook文件存在');

  // 检查环境变量
  const hookEnv = process.env.CLAUDE_PRETOOLUSE_HOOK;
  if (hookEnv && hookEnv.includes(hookFile)) {
    console.log('✅ 环境变量已配置');
  } else {
    console.log('⚠️  环境变量未设置，需要重新加载Shell');
    console.log('💡 运行: source ~/.zshrc 或重启终端');
  }

  // 检查服务状态
  checkServiceStatus();

  console.log('');
  console.log('🎯 测试说明:');
  console.log('');
  console.log('当Aegis正常工作时，以下命令会被拦截:');
  console.log('  rm -rf /          # 删除根目录');
  console.log('  git push --force  # 强制推送');
  console.log('  chmod 777 /etc/   # 危险权限');
  console.log('');
  console.log('💡 在Claude Code中尝试执行危险命令来测试拦截功能');
}

function checkServiceStatus() {
  const http = require('http');

  // 检查后端服务
  const checkBackend = new Promise((resolve) => {
    const req = http.request({ port: 9876, timeout: 1000 }, () => resolve(true));
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });

  // 检查Web界面
  const checkWeb = new Promise((resolve) => {
    const req = http.request({ port: 3001, timeout: 1000 }, () => resolve(true));
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });

  Promise.all([checkBackend, checkWeb]).then(([backend, web]) => {
    console.log('📊 服务状态:');
    console.log('  Hook后端:', backend ? '✅ 运行中' : '❌ 停止');
    console.log('  Web界面:', web ? '✅ 运行中' : '❌ 停止');

    if (!backend || !web) {
      console.log('');
      console.log('💡 启动服务: npm start');
    }
  });
}

if (require.main === module) {
  testAegis();
}

module.exports = testAegis;