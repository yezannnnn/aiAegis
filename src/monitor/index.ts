#!/usr/bin/env node
/**
 * Aegis Monitor - 主入口 (TypeScript模块化重构版本)
 * 协调各个服务模块，保持简洁架构
 */

import { EventManager } from './event-manager';
import { WebSocketServer } from './websocket-server';
import { HTTPServer } from './http-server';
import { HookHandler } from './hook-handler';
import { ApprovalSystem } from './approval-system';
import { DualSync } from './dual-sync';
import { PortConfig } from './types';

// 导入端口管理器 (从源代码目录)
const { getAllPorts } = require('../../src/port-manager');

export class AegisMonitor {
  private eventManager: EventManager;
  private webSocketServer: WebSocketServer | null = null;
  private httpServer: HTTPServer | null = null;
  private hookHandler: HookHandler | null = null;
  private approvalSystem: ApprovalSystem;
  private dualSync: DualSync;

  private ports: PortConfig = { web: 3001, websocket: 8901, hook: 9876 };

  constructor() {
    this.eventManager = new EventManager();
    this.approvalSystem = new ApprovalSystem();
    this.dualSync = new DualSync();
  }

  /**
   * 启动监控系统
   */
  async start(): Promise<void> {
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

      // 设置事件监听
      this.setupEventListeners();

      // 显示启动横幅
      this.showStartupBanner();

    } catch (error) {
      console.error('❌ 启动失败:', (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * 启动各个服务模块
   */
  private async startServices(): Promise<void> {
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

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听双向同步事件
    this.dualSync.on('claude_native_decision', (data) => {
      console.log(`🔄 [Dual Sync] Claude原生决定: ${data.sessionId.substring(0, 8)}... - ${data.status}`);

      // 解决对应的审批请求
      this.approvalSystem.resolveApproval(data.sessionId, data.status === 'approved', data.reason, 'claude-native');
    });

    this.dualSync.on('web_interface_decision', (data) => {
      console.log(`🔄 [Dual Sync] Web界面决定: ${data.sessionId.substring(0, 8)}... - ${data.status}`);
      // Web界面的决定已经在hook-handler中处理
    });

    this.dualSync.on('dual_approval_updated', (data) => {
      // 广播双向同步状态更新
      this.webSocketServer?.broadcastToClients({
        type: 'dual_approval_status_update',
        ...data
      });
    });

    // 定期清理过期的审批请求
    this.approvalSystem.startPeriodicCleanup(60000); // 1分钟清理一次
  }

  /**
   * 显示启动横幅
   */
  private showStartupBanner(): void {
    console.log('');
    console.log('🛡️ Aegis 真实监控系统已启动 (TypeScript版本)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 监控界面: http://localhost:${this.ports.web}`);
    console.log(`📡 WebSocket服务: ws://localhost:${this.ports.websocket}`);
    console.log(`🔗 Hook后端: http://localhost:${this.ports.hook}`);
    console.log('📋 支持的Agent CLI:');
    console.log('   • Hermes (🔥) • OpenClaw (🔧) • Claude Code (🤖)');
    console.log('   • GitHub Codex (💻) • GPT-4 (🧠)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('💡 TypeScript模块化架构 + 双重审批功能已就绪');
    console.log('🔄 支持Claude原生 + 3001界面双向同步');
    console.log('🔧 类型安全的代码架构，更易维护和扩展');
  }

  /**
   * 停止监控系统
   */
  stop(): void {
    console.log('\n🛑 正在停止监控系统...');

    // 停止双向同步
    this.dualSync.stop();

    // 停止各个服务
    if (this.webSocketServer) this.webSocketServer.stop();
    if (this.httpServer) this.httpServer.stop();
    if (this.hookHandler) this.hookHandler.stop();

    console.log('✅ Aegis 监控系统已停止');
    process.exit(0);
  }

  /**
   * 获取系统统计信息
   */
  getStats() {
    return {
      ports: this.ports,
      services: {
        eventManager: {
          stats: this.eventManager.getStats(),
          events: this.eventManager.getEvents().length,
          sessions: this.eventManager.getSessions().size,
          agents: this.eventManager.getActiveAgents().size
        },
        webSocket: this.webSocketServer?.getClientCount() || 0,
        http: this.httpServer?.getStats() || null,
        hook: this.hookHandler?.getStats() || null,
        approval: this.approvalSystem.getStats(),
        dualSync: this.dualSync.getStats()
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '2.0.0-ts'
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];

    // 检查各个服务状态
    if (!this.webSocketServer || this.webSocketServer.getClientCount() < 0) {
      issues.push('WebSocket服务器异常');
    }

    if (!this.httpServer) {
      issues.push('HTTP服务器未启动');
    }

    if (!this.hookHandler) {
      issues.push('Hook处理器未启动');
    }

    // 检查双向同步健康状态
    const syncHealth = this.dualSync.checkSyncHealth();
    if (!syncHealth.healthy) {
      issues.push(`双向同步异常: ${syncHealth.message}`);
    }

    return {
      healthy: issues.length === 0,
      issues
    };
  }
}

// 启动监控系统
if (require.main === module) {
  const monitor = new AegisMonitor();

  // 优雅关闭
  process.on('SIGINT', () => monitor.stop());
  process.on('SIGTERM', () => monitor.stop());

  // 启动系统
  monitor.start().catch((error) => {
    console.error('🔥 系统启动失败:', error);
    process.exit(1);
  });
}

export default AegisMonitor;