import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventManagerService } from '../monitoring/event-manager.service';
import { ApprovalService } from '../approval/approval.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { EventStatus } from '../monitoring/dto';
import { Inject, forwardRef } from '@nestjs/common';

@WSGateway({
  cors: {
    origin: ['http://localhost:3001', 'http://localhost:5173'],
    credentials: true,
  },
})
export class WebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly eventManager: EventManagerService,
    @Inject(forwardRef(() => ApprovalService)) private readonly approvalService: ApprovalService,
    @Inject(forwardRef(() => MonitoringService)) private readonly monitoringService: MonitoringService,
  ) {}

  afterInit(server: Server) {
    console.log('📡 WebSocket服务器初始化完成');

    // 确保服务器已初始化后再监听事件管理器的事件
    this.eventManager.on('new_event', (event) => {
      this.broadcastEvent('new_event', event);
    });

    this.eventManager.on('session_update', (session) => {
      this.broadcastEvent('session_update', session);
    });

    this.eventManager.on('agent_update', (agent) => {
      this.broadcastEvent('agent_update', agent);
    });
  }

  async handleConnection(client: Socket) {
    console.log('📡 WebSocket client connected:', client.id);

    // 发送初始状态
    client.emit('initial_state', {
      stats: await this.eventManager.getStats(),
      events: this.eventManager.getInitialEvents(50).map(e => ({ ...e, reason: e.description })),
      sessions: this.eventManager.getSessions(),
      agents: this.eventManager.getAgents(),
    });
  }

  handleDisconnect(client: Socket) {
    console.log('📡 WebSocket client disconnected:', client.id);
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    client.emit('pong', data);
  }

  @SubscribeMessage('get_stats')
  async handleGetStats(@ConnectedSocket() client: Socket) {
    client.emit('stats_update', await this.eventManager.getStats());
  }

  @SubscribeMessage('approval_response')
  async handleApprovalResponse(
    @MessageBody() data: { sessionId: string; approved: boolean; reason?: string; approvalId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    console.log('📋 收到审批响应:', data);

    // 使用sessionId作为approvalId（如果没有提供approvalId）
    const approvalId = data.approvalId || data.sessionId;

    try {
      // 获取审批记录
      const approval = await this.approvalService.getApproval(approvalId);
      if (!approval) {
        console.error('❌ 审批请求不存在:', approvalId);
        this.broadcastEvent('approval_resolved', { ...data, error: 'Approval not found' });
        return;
      }

      if (approval.status !== 'pending') {
        console.error('❌ 审批已处理，无法重复操作:', approval.status);
        this.broadcastEvent('approval_resolved', { ...data, error: 'Already processed' });
        return;
      }

      // 更新数据库
      await this.approvalService.makeDecision(
        approvalId,
        data.approved ? 'approve' : 'deny',
        data.reason
      );

      // 同步更新事件状态
      const newStatus = data.approved ? EventStatus.APPROVED : EventStatus.BLOCKED;
      this.monitoringService.updateEventStatus(approval.eventId, newStatus);

      // WebSocket 广播 approval_decision 事件（与监控控制器保持一致）
      if (this.server) {
        this.server.emit('approval_decision', {
          approvalId,
          status: data.approved ? 'approved' : 'denied',
          command: approval.command,
          reason: data.reason,
          source: 'aegis_ui'
        });
      } else {
        console.warn('⚠️ WebSocket server not initialized, skipping approval_decision broadcast');
      }

      console.log(`✅ 审批决定已处理: ${approvalId} -> ${data.approved ? 'approved' : 'denied'}`);
    } catch (error) {
      console.error('❌ 审批决定处理异常:', error);
      this.broadcastEvent('approval_resolved', { ...data, error: error.message });
    }
  }

  // 广播审批请求
  broadcastApprovalRequest(approvalData: any) {
    if (!this.server) {
      console.warn('⚠️ WebSocket server not initialized, skipping approval request broadcast');
      return;
    }
    this.server.emit('approval_request', {
      type: 'approval_request',
      ...approvalData,
    });
  }

  // 广播事件到所有客户端
  private broadcastEvent(eventType: string, data: any) {
    if (!this.server) {
      console.warn('⚠️ WebSocket server not initialized, skipping broadcast:', eventType);
      return;
    }
    this.server.emit(eventType, {
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}