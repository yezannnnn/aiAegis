#!/usr/bin/env node

/**
 * Aegis后端服务 - Socket架构方案
 * 专门处理Hook事件，通过WebSocket与前端通信
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class AegisBackendService {
  constructor() {
    this.port = 9876; // 后端服务端口
    this.webSocketPort = 9877; // WebSocket端口
    this.events = []; // 内存事件队列
    this.maxEvents = 1000; // 最大事件数
    this.webSocketServer = null;
    this.httpServer = null;
    this.clients = new Set(); // 连接的Web客户端
  }

  // 启动后端服务
  start() {
    this.startHTTPServer();
    this.startWebSocketServer();
    console.log('🚀 Aegis后端服务已启动');
    console.log(`📡 Hook事件接收: http://localhost:${this.port}/hook-event`);
    console.log(`🔗 WebSocket连接: ws://localhost:${this.webSocketPort}`);
  }

  // HTTP服务：接收Hook事件
  startHTTPServer() {
    this.httpServer = http.createServer((req, res) => {
      // CORS设置
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/hook-event' && req.method === 'POST') {
        this.handleHookEvent(req, res);
      } else if (req.url === '/status' && req.method === 'GET') {
        this.handleStatus(req, res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.httpServer.listen(this.port, () => {
      console.log(`📡 HTTP服务监听端口: ${this.port}`);
    });
  }

  // WebSocket服务：与Web界面实时通信
  startWebSocketServer() {
    this.webSocketServer = new WebSocket.Server({
      port: this.webSocketPort,
      perMessageDeflate: false
    });

    this.webSocketServer.on('connection', (ws) => {
      console.log('🔗 Web客户端已连接');
      this.clients.add(ws);

      // 发送历史事件
      ws.send(JSON.stringify({
        type: 'init',
        events: this.events.slice(-50) // 发送最近50个事件
      }));

      ws.on('close', () => {
        console.log('❌ Web客户端已断开');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('🔥 WebSocket错误:', error.message);
        this.clients.delete(ws);
      });
    });

    console.log(`🔗 WebSocket服务监听端口: ${this.webSocketPort}`);
  }

  // 处理Hook事件
  handleHookEvent(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const eventData = JSON.parse(body);

        // 添加服务器时间戳和ID
        const event = {
          id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          ...eventData,
          serverTimestamp: new Date().toISOString(),
          processed: true
        };

        // 存储事件
        this.addEvent(event);

        // 广播给所有Web客户端
        this.broadcastEvent(event);

        // 响应Hook
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          eventId: event.id,
          clients: this.clients.size
        }));

        console.log(`📡 接收Hook事件: ${event.type} - ${event.message}`);

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }

  // 处理状态查询
  handleStatus(req, res) {
    const status = {
      service: 'running',
      events: this.events.length,
      clients: this.clients.size,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  }

  // 添加事件到队列
  addEvent(event) {
    this.events.push(event);

    // 限制事件数量，防止内存溢出
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  // 广播事件给所有Web客户端
  broadcastEvent(event) {
    const message = JSON.stringify({
      type: 'new_event',
      event: event
    });

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('📤 发送事件失败:', error.message);
          this.clients.delete(client);
        }
      } else {
        this.clients.delete(client);
      }
    });

    console.log(`📤 事件已广播给 ${this.clients.size} 个客户端`);
  }

  // 优雅关闭
  shutdown() {
    console.log('🛑 正在关闭Aegis后端服务...');

    if (this.webSocketServer) {
      this.webSocketServer.close();
    }

    if (this.httpServer) {
      this.httpServer.close();
    }

    console.log('✅ Aegis后端服务已关闭');
  }
}

// 启动服务
if (require.main === module) {
  const service = new AegisBackendService();

  // 处理退出信号
  process.on('SIGINT', () => {
    service.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    service.shutdown();
    process.exit(0);
  });

  service.start();
}

module.exports = AegisBackendService;