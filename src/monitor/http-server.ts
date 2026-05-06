/**
 * HTTP 服务器 - 监控界面和API路由
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { EventManager } from './event-manager';
import { WebSocketServer } from './websocket-server';

export class HTTPServer {
  private server: http.Server | null = null;

  constructor(
    private port: number,
    private eventManager: EventManager,
    private webSocketServer: WebSocketServer
  ) {
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  /**
   * 启动HTTP服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }

      this.server.listen(this.port, () => {
        console.log(`✅ Web监控界面已启动: http://localhost:${this.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('HTTP服务器错误:', error);
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
      if (url === '/' && method === 'GET') {
        this.handleMonitorUI(req, res);
      } else if (url === '/api/intercept' && method === 'POST') {
        this.handleInterceptAPI(req, res);
      } else if (url === '/api/session' && method === 'POST') {
        this.handleSessionAPI(req, res);
      } else if (url === '/api/stats' && method === 'GET') {
        this.handleStatsAPI(req, res);
      } else if (url === '/api/health' && method === 'GET') {
        this.handleHealthAPI(req, res);
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
   * 处理监控界面
   */
  private handleMonitorUI(req: http.IncomingMessage, res: http.ServerResponse): void {
    const uiPath = path.join(__dirname, '../../monitor-ui.html');

    fs.readFile(uiPath, 'utf8', (err, data) => {
      if (err) {
        console.error('读取监控界面文件失败:', err);
        this.handleError(res, new Error('无法加载监控界面'));
        return;
      }

      // 注入实时WebSocket脚本
      const realtimeScript = this.generateWebSocketScript();
      const htmlWithScript = data.replace('</body>', realtimeScript + '</body>');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlWithScript);
    });
  }

  /**
   * 生成WebSocket脚本
   */
  private generateWebSocketScript(): string {
    const wsPort = (this.webSocketServer as any).port || 8901; // 获取WebSocket端口

    return `
      <script>
        // WebSocket 连接配置
        const WS_PORT = ${wsPort};

        // 初始化WebSocket连接
        const ws = new WebSocket('ws://localhost:' + WS_PORT);
        let stats = { total: 0, blocked: 0, allowed: 0, warning: 0, pending: 0 };

        ws.onopen = () => {
          console.log('🔌 WebSocket 连接已建立');
          updateConnectionStatus(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
          } catch (e) {
            console.error('解析WebSocket消息失败:', e);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket 错误:', error);
          updateConnectionStatus(false);
        };

        ws.onclose = () => {
          console.log('WebSocket 连接已关闭，尝试重连...');
          updateConnectionStatus(false);
          setTimeout(() => window.location.reload(), 3000);
        };

        // 处理WebSocket消息
        function handleWebSocketMessage(data) {
          switch(data.type) {
            case 'initial_state':
              stats = data.stats;
              updateUI(data);
              break;
            case 'new_event':
              stats = data.stats;
              addEventToUI(data.event);
              updateStats();
              break;
            case 'approval_request':
              handleApprovalNotification(data);
              break;
            case 'dual_approval_request':
              handleDualApprovalNotification(data);
              break;
          }
        }

        // 更新连接状态
        function updateConnectionStatus(connected) {
          const statusEl = document.querySelector('.connection-status');
          if (statusEl) {
            statusEl.textContent = connected ? '已连接' : '连接断开';
            statusEl.className = 'connection-status ' + (connected ? 'connected' : 'disconnected');
          }
        }

        // 更新统计数据
        function updateStats() {
          const elements = {
            total: document.querySelector('.stat-total .stat-number'),
            blocked: document.querySelector('.stat-blocked .stat-number'),
            allowed: document.querySelector('.stat-allowed .stat-number'),
            warning: document.querySelector('.stat-warning .stat-number'),
            pending: document.querySelector('.stat-pending .stat-number')
          };

          Object.entries(elements).forEach(([key, el]) => {
            if (el) el.textContent = stats[key] || 0;
          });
        }

        // 添加事件到UI (简化版本，实际实现在monitor-ui.html中)
        function addEventToUI(event) {
          console.log('新事件:', event);
          // 这里会调用monitor-ui.html中定义的函数
          if (typeof addEventToUI_Real === 'function') {
            addEventToUI_Real(event);
          }
        }

        // 更新整体UI
        function updateUI(initialData) {
          console.log('初始状态:', initialData);
          // 这里会调用monitor-ui.html中定义的函数
          if (typeof updateUI_Real === 'function') {
            updateUI_Real(initialData);
          }
        }

        // 处理审批通知 - 调用实际的HTML实现
        function handleApprovalNotification(data) {
          console.log('📡 收到WebSocket审批通知:', data);
          // 调用HTML中定义的实际处理函数
          if (typeof window.handleApprovalNotification_Real === 'function') {
            window.handleApprovalNotification_Real(data);
          } else if (typeof handleApprovalNotification_Real === 'function') {
            handleApprovalNotification_Real(data);
          } else {
            // 降级：直接尝试调用前端的实现
            try {
              // 检查是否有全局的showApprovalModal函数
              if (typeof showApprovalModal === 'function') {
                showApprovalModal(data);
              }
            } catch (error) {
              console.error('调用前端审批函数失败:', error);
            }
          }
        }

        // 处理双重审批通知 - 调用实际的HTML实现
        function handleDualApprovalNotification(data) {
          console.log('📡 收到双重审批通知:', data);
          // 调用HTML中定义的实际处理函数
          if (typeof window.handleDualApprovalNotification_Real === 'function') {
            window.handleDualApprovalNotification_Real(data);
          } else if (typeof handleDualApprovalNotification_Real === 'function') {
            handleDualApprovalNotification_Real(data);
          } else {
            // 降级：显示双重审批界面
            try {
              if (typeof showApprovalModal === 'function') {
                showApprovalModal(data);
              }
            } catch (error) {
              console.error('调用双重审批函数失败:', error);
            }
          }
        }

        console.log('🔧 Aegis 监控界面脚本已加载 (TypeScript版本)');
      </script>`;
  }

  /**
   * 处理拦截事件API
   */
  private handleInterceptAPI(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const eventData = JSON.parse(body);
        const eventId = this.eventManager.addInterceptionEvent(eventData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          eventId,
          message: 'Interception event received'
        }));

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid JSON data'
        }));
      }
    });
  }

  /**
   * 处理会话API
   */
  private handleSessionAPI(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const sessionData = JSON.parse(body);
        this.eventManager.updateSession(sessionData.sessionId, sessionData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Session updated'
        }));

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid JSON data'
        }));
      }
    });
  }

  /**
   * 处理统计API
   */
  private handleStatsAPI(req: http.IncomingMessage, res: http.ServerResponse): void {
    const stats = this.eventManager.getStats();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * 处理健康检查API
   */
  private handleHealthAPI(req: http.IncomingMessage, res: http.ServerResponse): void {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connections: {
        websocket: this.webSocketServer.getClientCount(),
        http: 'active'
      },
      version: '2.0.0-ts'
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  }

  /**
   * 处理404错误
   */
  private handle404(res: http.ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not Found',
      message: 'The requested resource was not found'
    }));
  }

  /**
   * 处理错误
   */
  private handleError(res: http.ServerResponse, error: Error): void {
    console.error('HTTP请求处理错误:', error);

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message
    }));
  }

  /**
   * 停止HTTP服务器
   */
  stop(): void {
    if (this.server) {
      console.log('🌐 正在停止HTTP服务器...');

      this.server.close(() => {
        console.log('🌐 HTTP服务器已停止');
      });
    }
  }

  /**
   * 获取服务器统计
   */
  getStats() {
    return {
      port: this.port,
      listening: this.server?.listening || false,
      connections: this.webSocketServer.getClientCount()
    };
  }
}