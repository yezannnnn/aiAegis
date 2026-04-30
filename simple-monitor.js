#!/usr/bin/env node
/**
 * Aegis 独立简单监控 - 避免端口冲突的简化版本
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

const AEGIS_HOST = '127.0.0.1';
const AEGIS_PORT = 9876;

console.log('🛡️  Aegis 简单监控模式');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 检查是否有Aegis daemon在运行
async function checkDaemon() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);

    socket.connect(AEGIS_PORT, AEGIS_HOST, () => {
      socket.end();
      resolve(true);
    });

    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// 监听Claude Hook的拦截输出
function monitorLogs() {
  console.log('📝 监听模式：等待命令拦截...');
  console.log('💡 在Claude Code中执行危险命令，拦截信息会在这里显示');
  console.log('⚠️  如果没有看到拦截，请确保已运行: aegis setup');
  console.log('');

  // 检查hook文件是否存在
  const hookPath = path.join(require('os').homedir(), '.aegis', 'claude-hook.js');
  if (fs.existsSync(hookPath)) {
    console.log('✅ Claude Hook已安装:', hookPath);
  } else {
    console.log('❌ Claude Hook未找到，请运行: aegis setup');
  }

  console.log('');
  console.log('🎯 监控已启动，等待拦截事件...');
  console.log('💡 按 Ctrl+C 停止监控');
  console.log('');
}

async function main() {
  const isDaemonRunning = await checkDaemon();

  if (isDaemonRunning) {
    console.log('✅ 检测到Aegis daemon运行中');
    console.log('🔗 连接到现有daemon: 127.0.0.1:9876');
  } else {
    console.log('⚠️  Aegis daemon未运行');
    console.log('💡 Claude Hook将使用fallback模式（基本规则检查）');
    console.log('📝 建议启动完整daemon: npm run monitor --simple');
  }

  console.log('');
  monitorLogs();

  // 保持进程运行
  process.on('SIGINT', () => {
    console.log('\n👋 简单监控已停止');
    process.exit(0);
  });
}

main().catch(console.error);