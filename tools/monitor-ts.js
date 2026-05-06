#!/usr/bin/env node
/**
 * Aegis Monitor TypeScript版本启动脚本
 * 使用模块化重构后的TypeScript架构
 */

const AegisMonitor = require('./dist/monitor/index').default;

// 启动新的TypeScript模块化监控系统
const monitor = new AegisMonitor();

console.log('🚀 启动 Aegis Monitor (TypeScript模块化版本)...');

monitor.start().catch((error) => {
  console.error('❌ 启动失败:', error);
  process.exit(1);
});

// 优雅关闭处理
process.on('SIGINT', () => {
  console.log('\n📡 收到关闭信号，正在停止监控系统...');
  monitor.stop();
});

process.on('SIGTERM', () => {
  console.log('\n📡 收到终止信号，正在停止监控系统...');
  monitor.stop();
});

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  monitor.stop();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason);
  console.error('Promise:', promise);
  monitor.stop();
});