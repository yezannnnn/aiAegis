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
    origin: ['http://localhost:3001', 'http://localhost:5173'],
    credentials: true,
  },
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

  // 广播 AI 意图分析结果（追加到已弹出的 Modal）
  broadcastApprovalAnalysis(approvalId: string, aiAnalysis: any) {
    this.server.emit('approval_analysis_update', { approvalId, aiAnalysis });
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