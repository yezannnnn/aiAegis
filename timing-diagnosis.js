#!/usr/bin/env node

const http = require('http');

console.log('🔬 Hook时序问题诊断');

// 模拟Hook的确切执行流程
function simulateActualHookFlow() {
  console.log('📡 步骤1: 启动HTTP请求到Web界面...');

  const eventData = JSON.stringify({
    type: 'blocked',
    message: '时序诊断测试',
    command: 'diagnostic test',
    agent: 'Timing Test',
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
    timeout: 1000
  };

  // 这里是关键：HTTP请求是异步的
  const req = http.request(options, (res) => {
    console.log('✅ HTTP请求成功完成！');
  });

  req.on('error', (err) => {
    console.error('❌ HTTP请求失败:', err.message);
  });

  req.on('timeout', () => {
    console.error('⏰ HTTP请求超时');
  });

  req.write(eventData);
  req.end();

  console.log('📝 步骤2: 显示拦截消息...');
  console.error('🛡️ AEGIS BLOCKED: 诊断测试命令');
  console.error('🎯 Agent: Claude Code');

  console.log('💀 步骤3: 立即退出进程...');
  // 模拟Hook的立即退出 - 这就是问题所在！
  setTimeout(() => {
    console.log('⚡ process.exit(2) - 进程被杀死');
    process.exit(2);
  }, 5); // 仅等5ms就退出
}

simulateActualHookFlow();