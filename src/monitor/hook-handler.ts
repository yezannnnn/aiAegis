/**
 * Hook处理器 - 处理来自AI工具的Hook事件
 */

import * as http from 'http';
import { EventManager } from './event-manager';
import { ApprovalSystem } from './approval-system';
import { WebSocketServer } from './websocket-server';
import { HookEvent, ApprovalRequest } from './types';

export class HookHandler {
  private server: http.Server | null = null;

  constructor(
    private port: number,
    private eventManager: EventManager,
    private approvalSystem: ApprovalSystem,
    private webSocketServer: WebSocketServer
  ) {
    this.server = http.createServer(this.handleRequest.bind(this));

    // 监听审批系统事件
    this.approvalSystem.on('approval_request_created', this.handleApprovalRequestCreated.bind(this));
    this.approvalSystem.on('approval_resolved', this.handleApprovalResolved.bind(this));
  }

  /**
   * 启动Hook服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Hook server not initialized'));
        return;
      }

      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`✅ Hook Daemon已启动: http://localhost:${this.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('Hook服务器错误:', error);
        reject(error);
      });
    });
  }

  /**
   * 处理HTTP请求
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '';
    const method = req.method || 'GET';

    // 设置CORS头
    this.setCORSHeaders(res);

    // 处理OPTIONS预检请求
    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 路由处理
    try {
      if (url === '/hook-event' && method === 'POST') {
        this.handleHookEvent(req, res);
      } else if (url === '/api/approval' && method === 'POST') {
        this.handleApprovalRequest(req, res);
      } else if (url === '/status' && method === 'GET') {
        this.handleStatus(req, res);
      } else {
        this.handle404(res);
      }
    } catch (error) {
      this.handleError(res, error as Error);
    }
  }

  /**
   * 设置CORS头
   */
  private setCORSHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  /**
   * 处理Hook事件
   */
  private async handleHookEvent(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const event: HookEvent = JSON.parse(body);

        // 提取会话ID
        const sessionId = this.extractSessionId(event);
        console.log(`📡 Hook事件: ${event.type || 'approval_request'} - Session: ${sessionId.substring(0, 8)}...`);

        // 处理事件
        const result = await this.processHookEvent(event, sessionId);

        // 返回结果
        const responseCode = result.approved ? 200 : 403;
        res.writeHead(responseCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: result.approved,
          approved: result.approved,
          reason: result.reason,
          timestamp: result.timestamp || new Date().toISOString(),
          sessionId,
          command: event.command || event.payload?.command || 'unknown',
          message: result.approved
            ? '✅ Command approved by user'
            : '❌ Command blocked - ' + result.reason
        }));

      } catch (error) {
        console.error('Hook事件处理错误:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    });
  }

  /**
   * 处理审批请求API
   */
  private async handleApprovalRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { sessionId, approved } = JSON.parse(body);
        const reason = approved ? 'Approved by user via web interface' : 'Denied by user via web interface';

        // 解决审批请求
        const resolved = this.approvalSystem.resolveApproval(sessionId, approved, reason, 'web');

        if (resolved) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            sessionId,
            status: approved ? 'allowed' : 'blocked',
            message: `Command ${approved ? 'approved' : 'denied'} successfully`,
            hookResumed: true
          }));

          console.log(`🛡️ [${new Date().toLocaleTimeString()}] User ${approved ? 'APPROVED' : 'DENIED'} session ${sessionId.substring(0, 8)}... via web interface`);

        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Approval request not found or expired'
          }));
        }

      } catch (error) {
        console.error('审批请求处理错误:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid approval request'
        }));
      }
    });
  }

  /**
   * 处理状态查询
   */
  private handleStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
    const status = {
      service: 'aegis-hook-daemon',
      status: 'running',
      pid: process.pid,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      ports: {
        hook: this.port,
        websocket: (this.webSocketServer as any).port,
        web: (this.eventManager as any).port
      },
      approvals: this.approvalSystem.getStats(),
      version: '2.0.0-ts'
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  }

  /**
   * 处理Hook事件的核心逻辑
   */
  private async processHookEvent(event: HookEvent, sessionId: string) {
    // 映射风险级别
    const risk = this.mapSeverityToRisk(event);

    // 创建审批数据
    const approvalData: ApprovalRequest = {
      sessionId,
      command: event.command || event.payload?.command || 'unknown',
      description: event.context?.astResult?.description || 'Security check required',
      risk,
      agentType: event.agentType || event.payload?.agentType || 'claude-code',
      context: {
        cwd: event.cwd || event.payload?.cwd || process.cwd(),
        user: event.context?.user || event.payload?.context?.user || 'unknown',
        project: event.context?.project || event.payload?.context?.project || 'unknown',
        astSeverity: event.context?.astResult?.severity,
        astDescription: event.context?.astResult?.description
      }
    };

    // 检查是否已被拒绝
    if (event.decision === 'DENY' || event.action === 'block') {
      // 直接阻止
      const eventData = {
        command: approvalData.command,
        agent: approvalData.agentType,
        risk: approvalData.risk,
        status: 'blocked' as const,
        sessionId,
        userContext: {
          user: approvalData.context.user,
          project: approvalData.context.project,
          cwd: approvalData.context.cwd
        },
        intent: event.intent || 'unknown_intent',
        description: approvalData.description
      };

      this.eventManager.addInterceptionEvent(eventData);

      return {
        approved: false,
        reason: event.context?.astResult?.description || 'Blocked by security rules',
        timestamp: new Date().toISOString(),
        source: 'ast-engine'
      };
    }

    // 需要审批的命令
    const eventData = {
      command: approvalData.command,
      agent: approvalData.agentType,
      risk: approvalData.risk,
      status: 'pending' as const,
      sessionId,
      userContext: {
        user: approvalData.context.user,
        project: approvalData.context.project,
        cwd: approvalData.context.cwd
      },
      intent: event.intent || 'unknown_intent',
      description: approvalData.description
    };

    this.eventManager.addInterceptionEvent(eventData);

    // 广播审批请求
    this.webSocketServer.sendApprovalRequest({
      sessionId,
      command: approvalData.command,
      agent: approvalData.agentType,
      risk: approvalData.risk,
      status: 'pending',
      userContext: approvalData.context,
      timestamp: new Date().toISOString(),
      astResult: event.context?.astResult
    });

    // 等待审批结果
    try {
      const result = await this.approvalSystem.createApprovalRequest(approvalData);
      return result;
    } catch (error) {
      return {
        approved: false,
        reason: (error as Error).message || 'Approval timeout or error',
        timestamp: new Date().toISOString(),
        source: 'system'
      };
    }
  }

  /**
   * 提取会话ID
   */
  private extractSessionId(event: HookEvent): string {
    return event.sessionId ||
           event.payload?.sessionId ||
           `hook-${Date.now()}`;
  }

  /**
   * 映射严重性到风险级别
   */
  private mapSeverityToRisk(event: HookEvent): 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const astResult = event.context?.astResult;
    if (!astResult || !astResult.severity) {
      return 'MEDIUM';
    }

    switch (astResult.severity) {
      case 'block': return 'CRITICAL';
      case 'error': return 'HIGH';
      case 'warn': return 'MEDIUM';
      default: return 'LOW';
    }
  }

  /**
   * 处理审批请求创建事件
   */
  private handleApprovalRequestCreated(data: any): void {
    console.log(`🔒 [${new Date().toLocaleTimeString()}] 审批请求已创建: ${data.sessionId.substring(0, 8)}...`);
  }

  /**
   * 处理审批解决事件
   */
  private handleApprovalResolved(data: any): void {
    // 更新事件状态
    this.eventManager.updateEventStatus(
      data.sessionId,
      data.approved ? 'allowed' : 'blocked',
      data.reason
    );

    console.log(`✅ [${new Date().toLocaleTimeString()}] 审批已解决: ${data.sessionId.substring(0, 8)}... - ${data.approved ? 'APPROVED' : 'DENIED'}`);
  }

  /**
   * 处理404错误
   */
  private handle404(res: http.ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not Found',
      message: 'Hook endpoint not found'
    }));
  }

  /**
   * 处理错误
   */
  private handleError(res: http.ServerResponse, error: Error): void {
    console.error('Hook请求处理错误:', error);

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message
    }));
  }

  /**
   * 停止Hook服务器
   */
  stop(): void {
    if (this.server) {
      console.log('🔗 正在停止Hook服务器...');

      this.server.close(() => {
        console.log('🔗 Hook服务器已停止');
      });
    }

    // 停止审批系统
    this.approvalSystem.stop();
  }

  /**
   * 获取Hook统计
   */
  getStats() {
    return {
      port: this.port,
      listening: this.server?.listening || false,
      approvals: this.approvalSystem.getStats()
    };
  }
}