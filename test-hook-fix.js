#!/usr/bin/env node

const http = require('http');

console.log('🔧 测试Hook修复方案...');

// 同步版本的发送事件（等待HTTP请求完成）
function sendEventToWebMonitorSync(type, message, command = '', agent = 'Test Hook') {
  return new Promise((resolve, reject) => {
    const eventData = JSON.stringify({
      type,
      message,
      command,
      agent,
      timestamp: new Date().toLocaleString('zh-CN')
    });

    const options = {
      hostname: '127.0.0.1',
      port: 3001,
      path: '/add-event',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(eventData)
      },
      timeout: 500 // 减少超时时间但确保完成
    };

    const req = http.request(options, (res) => {
      console.log('✅ 事件发送成功');
      resolve(res.statusCode);
    });

    req.on('error', (err) => {
      console.log('⚠️ 事件发送失败（静默忽略）');
      resolve(null); // 不中断主流程
    });

    req.on('timeout', () => {
      console.log('⚠️ 事件发送超时（静默忽略）');
      req.destroy();
      resolve(null);
    });

    req.write(eventData);
    req.end();
  });
}

// 模拟改进的Hook行为
async function improvedHookBehavior() {
  console.log('📡 发送事件到监控界面...');

  // 等待HTTP请求完成（或快速失败）
  await sendEventToWebMonitorSync('blocked', '改进的Hook测试', 'test command');

  console.log('🛡️ AEGIS BLOCKED: 测试命令');
  console.log('🎯 Agent: Claude Code');
  console.log('💡 现在安全退出...');
  process.exit(2);
}

improvedHookBehavior();