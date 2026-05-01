#!/usr/bin/env node

/**
 * 改进的Hook脚本 - 与后端服务通信
 * 解决时序问题，提高可靠性
 */

const http = require('http');

// Hook配置
const BACKEND_SERVICE_HOST = '127.0.0.1';
const BACKEND_SERVICE_PORT = 9876;
const REQUEST_TIMEOUT = 50; // 短超时，快速失败

// 向后端服务发送事件
function sendEventToBackendService(type, message, command = '', agent = 'Claude Code') {
  const eventData = JSON.stringify({
    type,
    message,
    command,
    agent,
    timestamp: new Date().toISOString(),
    hookPid: process.pid
  });

  const options = {
    hostname: BACKEND_SERVICE_HOST,
    port: BACKEND_SERVICE_PORT,
    path: '/hook-event',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(eventData)
    },
    timeout: REQUEST_TIMEOUT
  };

  // 关键改进：使用更短的超时，更快的失败
  const req = http.request(options, (res) => {
    // 成功发送，但不等待完整响应
    if (res.statusCode === 200) {
      console.log('📡 事件已发送到后端服务');
    }
  });

  req.on('error', () => {
    // 静默处理错误，备选方案可以是文件记录
    console.log('⚠️  后端服务不可用，事件记录到本地');
    fallbackToFile(type, message, command, agent);
  });

  req.on('timeout', () => {
    req.destroy();
    console.log('⚠️  后端服务超时，事件记录到本地');
    fallbackToFile(type, message, command, agent);
  });

  req.write(eventData);
  req.end();
}

// 备选方案：文件记录
function fallbackToFile(type, message, command, agent) {
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const event = {
      type, message, command, agent,
      timestamp: new Date().toISOString(),
      source: 'hook-fallback'
    };

    const eventFile = path.join(os.tmpdir(), '.aegis-fallback-events');
    fs.writeFileSync(eventFile, JSON.stringify(event) + '\n', { flag: 'a' });
  } catch (e) {
    // 完全静默，确保不影响Hook主功能
  }
}

// 测试后端连接
function testBackendConnection() {
  const options = {
    hostname: BACKEND_SERVICE_HOST,
    port: BACKEND_SERVICE_PORT,
    path: '/status',
    method: 'GET',
    timeout: 1000
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// 模拟Hook的危险命令检测和拦截
async function simulateHookInterception() {
  console.log('🔬 模拟Hook拦截测试');

  // 测试后端服务连接
  const backendAvailable = await testBackendConnection();
  console.log(`🔗 后端服务状态: ${backendAvailable ? '✅ 可用' : '❌ 不可用'}`);

  // 模拟检测到危险命令
  const dangerousCommands = [
    { cmd: 'rm -rf /', reason: '尝试删除根目录' },
    { cmd: 'git push --force', reason: '强制推送风险' },
    { cmd: 'chmod 777 /etc/passwd', reason: '危险权限修改' }
  ];

  for (const { cmd, reason } of dangerousCommands) {
    console.log(`\n🛡️  拦截危险命令: ${cmd}`);

    // 发送事件到后端服务
    sendEventToBackendService('blocked', reason, cmd, 'Hook Test');

    // 模拟Hook的拦截输出
    console.error(`🛡️  AEGIS BLOCKED: ${reason}`);
    console.error(`🎯  Agent: Claude Code`);
    console.error(`📝  Command: ${cmd}`);

    // 模拟process.exit(2)前的短暂延迟
    await new Promise(resolve => setTimeout(resolve, 10));

    console.log(`✅ 事件处理完成 - 可安全退出`);
  }

  console.log('\n📊 Hook拦截测试完成');
}

// 如果直接运行，执行测试
if (require.main === module) {
  simulateHookInterception().then(() => {
    console.log('🏁 测试结束');
  });
}

// 导出函数供实际Hook使用
module.exports = {
  sendEventToBackendService,
  testBackendConnection
};