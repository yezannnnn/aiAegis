#!/usr/bin/env node

const http = require('http');

console.log('🔍 测试时序问题...');

// 模拟Hook的确切行为
function simulateHookBehavior() {
  const eventData = JSON.stringify({
    type: 'blocked',
    message: '时序测试',
    command: 'test command',
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

  console.log('📡 启动HTTP请求...');

  const req = http.request(options, (res) => {
    console.log('✅ HTTP响应收到！');
  });

  req.on('error', (err) => {
    console.error('❌ HTTP错误:', err.message);
  });

  req.on('timeout', () => {
    console.error('❌ HTTP超时');
  });

  req.write(eventData);
  req.end();

  console.log('🚀 立即退出（模拟process.exit）...');
  // 模拟Hook的立即退出
  setTimeout(() => {
    console.log('💀 进程退出');
    process.exit(2);
  }, 10); // 只等10ms就退出
}

simulateHookBehavior();