#!/usr/bin/env node

const { io } = require('socket.io-client');

console.log('🔌 测试 WebSocket 连接到 http://localhost:3001');

// 连接到 WebSocket
const socket = io('http://localhost:3001', {
  transports: ['websocket'],
  autoConnect: true,
});

socket.on('connect', () => {
  console.log('✅ WebSocket 连接成功');
  console.log('📊 连接ID:', socket.id);

  // 监听初始状态
  socket.on('initial_state', (data) => {
    console.log('📊 收到初始状态:', data);
  });

  // 监听新事件
  socket.on('new_event', (data) => {
    console.log('🚨 新安全事件:', data);
  });

  setTimeout(() => {
    console.log('🔌 断开连接测试');
    socket.disconnect();
    process.exit(0);
  }, 5000);
});

socket.on('disconnect', () => {
  console.log('📡 WebSocket 连接断开');
});

socket.on('connect_error', (error) => {
  console.error('❌ WebSocket 连接失败:', error.message);
  process.exit(1);
});

// 超时处理
setTimeout(() => {
  console.error('⏰ 连接超时');
  process.exit(1);
}, 10000);