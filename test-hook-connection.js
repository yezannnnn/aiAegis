#!/usr/bin/env node

const http = require('http');

// 模拟Hook发送事件的确切方式
function testHookConnection() {
  const eventData = JSON.stringify({
    type: 'blocked',
    message: 'Hook连接测试',
    command: 'test command',
    agent: 'Test Hook',
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

  console.log('🔍 测试Hook连接...');
  console.log('发送数据:', eventData);

  const req = http.request(options, (res) => {
    console.log('✅ 响应状态:', res.statusCode);
    let responseData = '';
    res.on('data', chunk => responseData += chunk);
    res.on('end', () => {
      console.log('✅ 响应数据:', responseData);
    });
  });

  req.on('error', (err) => {
    console.error('❌ 请求错误:', err.message);
  });

  req.on('timeout', () => {
    console.error('❌ 请求超时 (1000ms)');
    req.destroy();
  });

  req.write(eventData);
  req.end();
}

testHookConnection();