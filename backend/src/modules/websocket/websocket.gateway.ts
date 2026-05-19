import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { EventManagerService } from '../monitoring/event-manager.service';
import { SqliteStorageService } from '../storage/sqlite-storage.service';
import { ApprovalService } from '../approval/approval.service';
import { EventStatus } from '../monitoring/dto';

@WSGateway({
  cors: {
    origin: ['http://localhost:3001', 'http://localhost:5173'],
    credentials: true,
  },
})
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly eventManager: EventManagerService,
    private readonly storage: SqliteStorageService,
    @Inject(forwardRef(() => ApprovalService))
    private readonly approvalService: ApprovalService,
  ) {}

  onModuleInit() {
    // 所有模块初始化完成后再挂监听器，避免 forwardRef proxy 问题
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

    // 发送初始状态 —— events 直接查数据库
    const dbEvents = this.storage.isReady()
      ? await this.storage.getEvents(50)
      : this.eventManager.getInitialEvents(50);

    client.emit('initial_state', {
      stats: await this.eventManager.getStats(),
      events: dbEvents.map(e => ({ ...e, reason: e.description })),
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
    @MessageBody() data: { approvalId?: string; sessionId: string; approved: boolean; reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    console.log('📋 收到审批响应:', data);
    const approvalId = data.approvalId || data.sessionId;
    const action = data.approved ? 'approve' : 'deny';
    const result = await this.approvalService.makeDecision(approvalId, action, data.reason);
    if (result?.eventId) {
      const newStatus = data.approved ? EventStatus.ALLOWED : EventStatus.BLOCKED;
      this.eventManager.updateEventStatus(result.eventId, newStatus);
    }
    this.broadcastEvent('approval_resolved', { ...data, approvalId });
  }

  // 广播审批请求
  broadcastApprovalRequest(approvalData: any) {
    this.server.emit('approval_request', {
      type: 'approval_request',
      ...approvalData,
    });
  }

  // 广播事件到所有客户端
  private broadcastEvent(eventType: string, data: any) {
    if (!this.server) return;
    this.server.emit(eventType, {
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}