#!/usr/bin/env node
/**
 * Aegis Monitor - 主入口 (模块化重构版本)
 * 协调各个服务模块，保持简洁架构
 */

const EventManager = require('./event-manager');
const WebSocketServer = require('./websocket-server');
const HTTPServer = require('./http-server');
const HookHandler = require('./hook-handler');
const ApprovalSystem = require('./approval-system');
const DualSync = require('./dual-sync');
const { getAllPorts } = require('../port-manager');

class AegisMonitor {
  constructor() {
    this.eventManager = new EventManager();
    this.webSocketServer = null;
    this.httpServer = null;
    this.hookHandler = null;
    this.approvalSystem = new ApprovalSystem();
    this.dualSync = new DualSync();

    this.ports = { web: 3001, websocket: 8901, hook: 9876 };
  }

  async start() {
    try {
      console.log('🔍 正在检测可用端口...');

      // 获取可用端口
      this.ports = await getAllPorts();
      console.log('✅ 端口分配完成:');
      console.log(`   Web界面: ${this.ports.web}`);
      console.log(`   WebSocket: ${this.ports.websocket}`);
      console.log(`   Hook服务: ${this.ports.hook}`);
      console.log('');

      // 启动各个服务模块
      await this.startServices();

      // 启动双向同步
      this.dualSync.initialize();

      // 显示启动横幅
      this.showStartupBanner();

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      process.exit(1);
    }
  }

  async startServices() {
    // 启动WebSocket服务器
    this.webSocketServer = new WebSocketServer(this.ports.websocket, this.eventManager);
    await this.webSocketServer.start();

    // 启动HTTP服务器
    this.httpServer = new HTTPServer(this.ports.web, this.eventManager, this.webSocketServer);
    await this.httpServer.start();

    // 启动Hook处理器
    this.hookHandler = new HookHandler(this.ports.hook, this.eventManager, this.approvalSystem, this.webSocketServer);
    await this.hookHandler.start();
  }

  showStartupBanner() {
    console.log('');
    console.log('🛡️ Aegis 真实监控系统已启动');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 监控界面: http://localhost:${this.ports.web}`);
    console.log(`📡 WebSocket服务: ws://localhost:${this.ports.websocket}`);
    console.log(`🔗 Hook后端: http://localhost:${this.ports.hook}`);
    console.log('📋 支持的Agent CLI:');
    console.log('   • Hermes (🔥) • OpenClaw (🔧) • Claude Code (🤖)');
    console.log('   • GitHub Codex (💻) • GPT-4 (🧠)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('💡 模块化架构 + 双重审批功能已就绪');
    console.log('🔄 支持Claude原生 + 3001界面双向同步');
  }

  stop() {
    console.log('\n🛑 正在停止监控系统...');

    if (this.webSocketServer) this.webSocketServer.stop();
    if (this.httpServer) this.httpServer.stop();
    if (this.hookHandler) this.hookHandler.stop();

    console.log('✅ Aegis 监控系统已停止');
    process.exit(0);
  }
}

// 启动监控系统
if (require.main === module) {
  const monitor = new AegisMonitor();

  // 优雅关闭
  process.on('SIGINT', () => monitor.stop());
  process.on('SIGTERM', () => monitor.stop());

  monitor.start();
}

module.exports = AegisMonitor;