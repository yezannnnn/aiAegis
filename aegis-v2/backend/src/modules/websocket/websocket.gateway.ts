import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventManagerService } from '../monitoring/event-manager.service';

@WSGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/monitor',
})
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly eventManager: EventManagerService) {
    // 监听事件管理器的事件
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

  handleConnection(client: Socket) {
    console.log('📡 WebSocket客户端连接:', client.id);

    // 发送初始状态
    client.emit('initial_state', {
      stats: this.eventManager.getStats(),
      events: this.eventManager.getEvents().slice(0, 50), // 最近50个事件
      sessions: this.eventManager.getSessions(),
      agents: this.eventManager.getAgents(),
    });
  }

  handleDisconnect(client: Socket) {
    console.log('📡 WebSocket客户端断开:', client.id);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong');
  }

  @SubscribeMessage('get_stats')
  handleGetStats(@ConnectedSocket() client: Socket) {
    client.emit('stats_response', this.eventManager.getStats());
  }

  @SubscribeMessage('approval_response')
  handleApprovalResponse(
    @MessageBody() data: { sessionId: string; approved: boolean; reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    console.log('📋 收到审批响应:', data);
    // 这里会与审批模块集成
    this.broadcastEvent('approval_resolved', data);
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
    this.server.emit(eventType, {
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}