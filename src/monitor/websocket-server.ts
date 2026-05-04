/**
 * WebSocket 服务器 - 实时通信
 */

import WebSocket from 'ws';
import { EventManager } from './event-manager';
import { WebSocketMessage } from './types';

export class WebSocketServer {
  private wss: WebSocket.Server | null = null;
  private clients = new Set<WebSocket>();

  constructor(
    private port: number,
    private eventManager: EventManager
  ) {
    // 监听事件管理器的广播
    this.eventManager.on('broadcast', this.broadcastToClients.bind(this));
    this.eventManager.on('new_event', this.broadcastToClients.bind(this));
    this.eventManager.on('agent_update', this.broadcastToClients.bind(this));
    this.eventManager.on('session_update', this.broadcastToClients.bind(this));
    this.eventManager.on('approval_resolved', this.broadcastToClients.bind(this));
  }

  /**
   * 启动WebSocket服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocket.Server({ port: this.port });

        this.wss.on('connection', this.handleConnection.bind(this));

        this.wss.on('listening', () => {
          console.log(`✅ WebSocket服务已启动: ws://localhost:${this.port}`);
          resolve();
        });

        this.wss.on('error', (error) => {
          console.error('WebSocket服务器错误:', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理新连接
   */
  private handleConnection(ws: WebSocket): void {
    console.log('📡 新的监控客户端连接');

    // 添加到客户端集合
    this.clients.add(ws);

    // 发送初始状态
    this.sendToClient(ws, {
      type: 'initial_state',
      ...this.eventManager.getInitialState()
    });

    // 处理客户端断开
    ws.on('close', () => {
      this.clients.delete(ws);
      console.log('📡 监控客户端断开连接');
    });

    // 处理客户端错误
    ws.on('error', (error) => {
      console.error('WebSocket客户端错误:', error);
      this.clients.delete(ws);
    });

    // 处理客户端消息
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(ws, message);
      } catch (error) {
        console.error('解析客户端消息失败:', error);
      }
    });
  }

  /**
   * 处理客户端消息
   */
  private handleClientMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, { type: 'pong' });
        break;

      case 'get_stats':
        this.sendToClient(ws, {
          type: 'stats_response',
          stats: this.eventManager.getStats()
        });
        break;

      default:
        console.log('未知的客户端消息类型:', message.type);
    }
  }

  /**
   * 向单个客户端发送消息
   */
  private sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('发送消息到客户端失败:', error);
        this.clients.delete(ws);
      }
    }
  }

  /**
   * 广播消息到所有客户端
   */
  broadcastToClients(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('广播消息失败:', error);
          this.clients.delete(client);
        }
      }
    });
  }

  /**
   * 发送审批请求通知
   */
  sendApprovalRequest(data: any): void {
    this.broadcastToClients({
      type: 'approval_request',
      ...data
    });
  }

  /**
   * 发送双重审批通知
   */
  sendDualApprovalNotification(data: any): void {
    this.broadcastToClients({
      type: 'dual_approval_request',
      ...data
    });
  }

  /**
   * 获取连接的客户端数量
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 停止WebSocket服务器
   */
  stop(): void {
    if (this.wss) {
      console.log('📡 正在停止WebSocket服务器...');

      // 关闭所有客户端连接
      this.clients.forEach(client => {
        client.close();
      });
      this.clients.clear();

      // 关闭服务器
      this.wss.close(() => {
        console.log('📡 WebSocket服务器已停止');
      });
    }
  }
}