#!/usr/bin/env node
/**
 * Aegis Real-time Monitor - 真实多Agent拦截监控系统
 * 支持 hermes, openClaw, claude code, codex 等 Agent CLI
 * 🔧 集成智能端口管理，避免开发环境冲突
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 🛡️ 智能端口管理器
const { getAllPorts, generatePortConfig } = require('./src/port-manager');

// 🔒 交互式审批系统
const InteractiveApproval = require('./src/interactive-approval');

// 动态端口配置 (将在启动时分配)
let PORT, WS_PORT, HOOK_PORT;

// 🔒 审批系统实例
const approvalSystem = new InteractiveApproval();

// 全局状态
let stats = {
  total: 0,
  blocked: 0,
  allowed: 0,
  warning: 0,
  pending: 0
};

let events = [];
let activeAgents = new Map(); // 活跃代理列表
let sessions = new Map(); // 用户会话信息

// 待审批管理 - 存储等待Web界面决定的审批请求
let pendingApprovals = new Map();
let wsClients = new Set(); // WebSocket客户端

// Agent CLI 配置
const agentConfigs = {
  'hermes': { name: 'Hermes', color: '#FF6B6B', icon: '🔥' },
  'openClaw': { name: 'OpenClaw', color: '#4ECDC4', icon: '🔧' },
  'claude-code': { name: 'Claude Code', color: '#45B7D1', icon: '🤖' },
  'codex': { name: 'GitHub Codex', color: '#96CEB4', icon: '💻' },
  'gpt4': { name: 'GPT-4', color: '#FFEAA7', icon: '🧠' }
};

// WebSocket 服务器 (动态端口分配)
let wss;
let server;
let hookServer;

// 🚀 智能启动函数
async function startAegisServices() {
  try {
    console.log('🔍 正在检测可用端口...');

    // 获取所有可用端口
    const ports = await getAllPorts();
    PORT = ports.web;
    WS_PORT = ports.websocket;
    HOOK_PORT = ports.hook;

    console.log('✅ 端口分配完成:');
    console.log(`   Web界面: ${PORT}`);
    console.log(`   WebSocket: ${WS_PORT}`);
    console.log(`   Hook服务: ${HOOK_PORT}`);
    console.log('');

    // 启动 WebSocket 服务器
    wss = new WebSocket.Server({ port: WS_PORT });

    wss.on('connection', (ws) => {
      console.log('📡 新的监控客户端连接');
      wsClients.add(ws);

      // 发送当前状态
      ws.send(JSON.stringify({
        type: 'initial_state',
        stats: stats,
        events: events.slice(0, 20),
        activeAgents: Array.from(activeAgents.entries()),
        sessions: Array.from(sessions.entries())
      }));

      ws.on('close', () => {
        wsClients.delete(ws);
        console.log('📡 监控客户端断开连接');
      });
    });

    console.log(`✅ WebSocket服务已启动: ws://localhost:${WS_PORT}`);

    // 启动其他服务...
    startWebServer();
    startHookServer();

  } catch (error) {
    console.error('❌ 启动失败:', error.message);

    // 端口冲突诊断
    console.log('\n🔍 正在运行端口诊断...');
    const { diagnosePortConflicts } = require('./src/port-manager');
    await diagnosePortConflicts();

    process.exit(1);
  }
}

// 广播消息到所有客户端
function broadcast(data) {
  const message = JSON.stringify(data);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 添加拦截事件
function addInterceptionEvent(eventData) {
  const event = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    time: new Date().toLocaleTimeString('zh-CN'),
    ...eventData
  };

  events.unshift(event);
  if (events.length > 100) {
    events = events.slice(0, 100);
  }

  // 更新统计
  stats.total++;
  if (event.status === 'blocked') stats.blocked++;
  else if (event.status === 'allowed') stats.allowed++;
  else if (event.status === 'warning') stats.warning++;
  else if (event.status === 'pending') stats.pending++;

  // 更新活跃代理
  updateActiveAgent(event.agent, event);

  // 广播事件
  broadcast({
    type: 'new_event',
    event: event,
    stats: stats
  });

  console.log(`🛡️ [${event.time}] ${event.status.toUpperCase()}: ${event.command} (Agent: ${event.agent})`);

  return event.id;
}

// 更新活跃代理
function updateActiveAgent(agentName, eventData) {
  const config = agentConfigs[agentName] || { name: agentName, color: '#888888', icon: '❓' };

  activeAgents.set(agentName, {
    name: config.name,
    color: config.color,
    icon: config.icon,
    lastActivity: new Date().toISOString(),
    lastCommand: eventData.command,
    sessionId: eventData.sessionId || 'unknown',
    userContext: eventData.userContext || {},
    intent: eventData.intent || 'unknown'
  });

  broadcast({
    type: 'agent_update',
    activeAgents: Array.from(activeAgents.entries())
  });
}

// 更新会话信息
function updateSession(sessionId, sessionData) {
  sessions.set(sessionId, {
    ...sessionData,
    lastUpdate: new Date().toISOString()
  });

  broadcast({
    type: 'session_update',
    sessions: Array.from(sessions.entries())
  });
}

// HTTP 服务器
server = http.createServer((req, res) => {
  if (req.url === '/') {
    // 返回监控界面
    fs.readFile('./monitor-ui.html', 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading UI');
        return;
      }

      // 注入实时监控脚本
      const realtimeScript = `
      <script>
        // WebSocket 连接
        const ws = new WebSocket('ws://localhost:${WS_PORT}');
        let stats = { total: 0, blocked: 0, allowed: 0, warning: 0, pending: 0 };
        let activeAgents = new Map();
        let sessions = new Map();

        ws.onopen = () => {
          console.log('🔌 WebSocket 连接已建立');
          // 更新页面连接状态
          if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus(true);
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch(data.type) {
              case 'initial_state':
                stats = data.stats;
                updateAgentList(data.activeAgents);
                updateSessionList(data.sessions);
                updateEventsList(data.events);
                updateStats();
                break;

              case 'new_event':
                stats = data.stats;
                addEventToUI(data.event);
                updateStats();
                break;

              case 'agent_update':
                updateAgentList(data.activeAgents);
                break;

              case 'session_update':
                updateSessionList(data.sessions);
                break;
            }
          } catch (e) {
            console.error('解析WebSocket消息失败:', e);
          }
        };

        // 更新统计数据
        function updateStats() {
          // 修复DOM元素类名匹配问题
          const totalEl = document.querySelector('.stat-total .stat-number');
          const blockedEl = document.querySelector('.stat-blocked .stat-number');
          const allowedEl = document.querySelector('.stat-allowed .stat-number');
          const warningEl = document.querySelector('.stat-warning .stat-number');
          const pendingEl = document.querySelector('.stat-pending .stat-number');

          // 安全更新，检查元素存在
          if (totalEl) totalEl.textContent = stats.total;
          if (blockedEl) blockedEl.textContent = stats.blocked;
          if (allowedEl) allowedEl.textContent = stats.allowed;
          if (warningEl) warningEl.textContent = stats.warning;
          if (pendingEl) pendingEl.textContent = stats.pending;
        }

        // 更新活跃代理列表
        function updateAgentList(agentsArray) {
          activeAgents = new Map(agentsArray);
          const container = document.querySelector('.agent-list');
          if (!container) return;

          container.innerHTML = Array.from(activeAgents.entries()).map(([name, agent]) => \`
            <div class="agent-item" style="border-left: 3px solid \${agent.color}">
              <div class="agent-icon">\${agent.icon}</div>
              <div class="agent-info">
                <div class="agent-name">\${agent.name}</div>
                <div class="agent-session">Session: \${agent.sessionId}</div>
                <div class="agent-intent">Intent: \${agent.intent}</div>
                <div class="agent-last-command">\${agent.lastCommand}</div>
                <div class="agent-time">\${new Date(agent.lastActivity).toLocaleTimeString()}</div>
              </div>
              <div class="agent-status online"></div>
            </div>
          \`).join('') || '<div class="empty-state">暂无活跃代理</div>';
        }

        // 更新会话列表
        function updateSessionList(sessionsArray) {
          sessions = new Map(sessionsArray);
          const container = document.querySelector('.session-list');
          if (!container) return;

          container.innerHTML = Array.from(sessions.entries()).map(([id, session]) => \`
            <div class="session-item">
              <div class="session-id">\${id}</div>
              <div class="session-user">User: \${session.user || 'unknown'}</div>
              <div class="session-project">Project: \${session.project || 'unknown'}</div>
              <div class="session-time">\${new Date(session.lastUpdate).toLocaleTimeString()}</div>
            </div>
          \`).join('') || '<div class="empty-state">暂无活跃会话</div>';
        }

        // 更新事件列表
        function updateEventsList(events) {
          const container = document.querySelector('.events-detailed');
          if (!container) return;

          container.innerHTML = events.map(event => \`
            <div class="event-item-detailed \${event.status}">
              <div class="event-status \${event.risk === 'CRITICAL' ? 'critical' : event.risk === 'HIGH' ? 'high' : ''}"></div>
              <div class="event-main">
                <div class="event-command">\${event.command}</div>
                <div class="event-context">
                  <span class="context-tag agent-tag" style="color: \${getAgentColor(event.agent)}">\${getAgentIcon(event.agent)} \${event.agent}</span>
                  <span class="context-tag">Risk: \${event.risk || 'LOW'}</span>
                  <span class="context-tag">Status: \${event.status}</span>
                  <span class="context-tag">Intent: \${event.intent || 'unknown'}</span>
                </div>
                <div class="event-user-context">
                  User: \${event.userContext?.user || 'unknown'} |
                  Project: \${event.userContext?.project || 'unknown'} |
                  Session: \${event.sessionId || 'unknown'}
                </div>
              </div>
              <div class="event-meta">
                <div class="event-time">\${event.time}</div>
                <div class="event-action">\${event.status}</div>
              </div>
            </div>
          \`).join('');
        }

        // 添加新事件到UI
        function addEventToUI(event) {
          const container = document.querySelector('.events-detailed');
          if (!container) return;

          // 生成审批按钮（仅对pending状态）
          const approvalButtons = event.status === 'pending' ? \`
            <div class="approval-actions" style="margin-top: 1rem; display: flex; gap: 0.75rem; align-items: center;">
              <button onclick="handleApproval('\${event.sessionId}', true)"
                      class="approval-btn approve-btn"
                      style="
                        background: rgba(34, 197, 94, 0.1);
                        border: 1px solid var(--accent-green, #22C55E);
                        color: var(--accent-green, #22C55E);
                        font-family: 'JetBrains Mono', monospace;
                        font-size: 0.75rem;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.1em;
                        padding: 0.5rem 1rem;
                        border-radius: 0;
                        cursor: pointer;
                        transition: all 0.2s ease;
                      "
                      onmouseover="this.style.background='var(--accent-green)'; this.style.color='var(--bg-primary)'"
                      onmouseout="this.style.background='rgba(34, 197, 94, 0.1)'; this.style.color='var(--accent-green)'">
                ✅ ALLOW
              </button>
              <button onclick="handleApproval('\${event.sessionId}', false)"
                      class="approval-btn deny-btn"
                      style="
                        background: rgba(220, 38, 38, 0.1);
                        border: 1px solid var(--danger, #DC2626);
                        color: var(--danger, #DC2626);
                        font-family: 'JetBrains Mono', monospace;
                        font-size: 0.75rem;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.1em;
                        padding: 0.5rem 1rem;
                        border-radius: 0;
                        cursor: pointer;
                        transition: all 0.2s ease;
                      "
                      onmouseover="this.style.background='var(--danger)'; this.style.color='var(--bg-primary)'"
                      onmouseout="this.style.background='rgba(220, 38, 38, 0.1)'; this.style.color='var(--danger)'">
                ❌ DENY
              </button>
              <button onclick="showEventDetails('\${event.sessionId}')"
                      class="approval-btn info-btn"
                      style="
                        background: rgba(59, 130, 246, 0.1);
                        border: 1px solid var(--info, #3B82F6);
                        color: var(--info, #3B82F6);
                        font-family: 'JetBrains Mono', monospace;
                        font-size: 0.75rem;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.1em;
                        padding: 0.5rem 1rem;
                        border-radius: 0;
                        cursor: pointer;
                        transition: all 0.2s ease;
                      "
                      onmouseover="this.style.background='var(--info)'; this.style.color='var(--bg-primary)'"
                      onmouseout="this.style.background='rgba(59, 130, 246, 0.1)'; this.style.color='var(--info)'">
                ℹ️ INFO
              </button>
            </div>
          \` : '';

          const eventHTML = \`
            <div class="event-item-detailed \${event.status} new-event" data-session-id="\${event.sessionId}">
              <div class="event-status \${event.risk === 'CRITICAL' ? 'critical' : event.risk === 'HIGH' ? 'high' : ''}"></div>
              <div class="event-main">
                <div class="event-command">\${event.command}</div>
                <div class="event-context">
                  <span class="context-tag agent-tag" style="color: \${getAgentColor(event.agent)}">\${getAgentIcon(event.agent)} \${event.agent}</span>
                  <span class="context-tag">Risk: \${event.risk || 'LOW'}</span>
                  <span class="context-tag">Status: \${event.status}</span>
                  <span class="context-tag">Intent: \${event.intent || 'unknown'}</span>
                </div>
                <div class="event-user-context">
                  User: \${event.userContext?.user || 'unknown'} |
                  Project: \${event.userContext?.project || 'unknown'} |
                  Session: \${event.sessionId || 'unknown'}
                </div>
                \${approvalButtons}
              </div>
              <div class="event-meta">
                <div class="event-time">\${event.time}</div>
                <div class="event-action">\${event.status}</div>
              </div>
            </div>
          \`;

          container.insertAdjacentHTML('afterbegin', eventHTML);

          // 移除动画类
          setTimeout(() => {
            container.querySelector('.new-event')?.classList.remove('new-event');
          }, 1000);

          // 保持最多50个事件
          while (container.children.length > 50) {
            container.removeChild(container.lastChild);
          }
        }

        // 获取代理颜色
        function getAgentColor(agentName) {
          const colors = {
            'hermes': '#FF6B6B',
            'openClaw': '#4ECDC4',
            'claude-code': '#45B7D1',
            'codex': '#96CEB4',
            'gpt4': '#FFEAA7'
          };
          return colors[agentName] || '#888888';
        }

        // 获取代理图标
        function getAgentIcon(agentName) {
          const icons = {
            'hermes': '🔥',
            'openClaw': '🔧',
            'claude-code': '🤖',
            'codex': '💻',
            'gpt4': '🧠'
          };
          return icons[agentName] || '❓';
        }

        // 处理审批决定
        function handleApproval(sessionId, approved) {
          const action = approved ? 'approve' : 'deny';

          // 确保使用正确的端口和协议
          const url = \`http://\${window.location.hostname}:9876/api/approval\`;

          console.log(\`发送审批请求: \${action} for session \${sessionId}\`);

          // 立即更新UI显示处理中状态
          const eventElement = document.querySelector(\`[data-session-id="\${sessionId}"]\`);
          if (eventElement) {
            const buttonsContainer = eventElement.querySelector('.approval-actions');
            if (buttonsContainer) {
              buttonsContainer.innerHTML = '<div style="color: var(--text-secondary); font-style: italic;">Processing...</div>';
            }
          }

          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              sessionId: sessionId,
              approved: approved,
              timestamp: Date.now()
            })
          })
          .then(response => {
            console.log('Response status:', response.status);
            if (!response.ok) {
              throw new Error(\`HTTP error! status: \${response.status}\`);
            }
            return response.json();
          })
          .then(data => {
            console.log('审批成功:', data);
            // 更新UI - 移除审批按钮，更新状态
            updateEventStatusUI(sessionId, approved ? 'allowed' : 'blocked');
          })
          .catch(error => {
            console.error('审批请求失败:', error);
            alert(\`审批失败: \${error.message}\`);

            // 恢复按钮
            location.reload();
          });
        }

        // 显示事件详情
        function showEventDetails(sessionId) {
          const eventElement = document.querySelector(\`[data-session-id="\${sessionId}"]\`);
          if (eventElement) {
            const command = eventElement.querySelector('.event-command').textContent;
            const contextTags = eventElement.querySelectorAll('.context-tag');
            const userContext = eventElement.querySelector('.event-user-context').textContent;

            let details = \`🛡️ AEGIS SECURITY DETAILS\\n\`;
            details += \`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n\\n\`;
            details += \`📋 Command: \${command}\\n\\n\`;

            contextTags.forEach(tag => {
              details += \`📊 \${tag.textContent}\\n\`;
            });

            details += \`\\n👤 \${userContext}\\n\\n\`;
            details += \`⚠️  This command requires manual approval due to security policies.\\n\`;
            details += \`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\`;

            // 创建自定义弹窗而不是使用alert
            console.log(details);

            // 临时使用alert，稍后可以改为自定义模态框
            alert(details);
          }
        }

        // 更新事件状态UI
        function updateEventStatusUI(sessionId, newStatus) {
          const eventElement = document.querySelector(\`[data-session-id="\${sessionId}"]\`);
          if (eventElement) {
            // 更新状态样式
            eventElement.className = \`event-item-detailed \${newStatus}\`;

            // 更新状态文本
            const statusElement = eventElement.querySelector('.event-action');
            if (statusElement) {
              statusElement.textContent = newStatus;
            }

            // 移除审批按钮
            const approvalButtons = eventElement.querySelector('.approval-buttons');
            if (approvalButtons) {
              approvalButtons.remove();
            }

            // 更新状态标签
            const statusTag = eventElement.querySelector('.context-tag:nth-child(3)');
            if (statusTag) {
              statusTag.textContent = \`Status: \${newStatus}\`;
            }
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket 错误:', error);
          // 更新页面连接状态为断开
          if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus(false);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket 连接已关闭，尝试重连...');
          // 更新页面连接状态为断开
          if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus(false);
          }
          setTimeout(() => {
            window.location.reload();
          }, 3000);
        };
      </script>`;

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data.replace('</body>', realtimeScript + '</body>'));
    });
  }
  else if (req.url === '/api/intercept' && req.method === 'POST') {
    // 接收拦截请求的API
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const eventId = addInterceptionEvent(data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          eventId: eventId,
          message: 'Interception event received'
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid JSON data'
        }));
      }
    });
  }
  else if (req.url === '/api/session' && req.method === 'POST') {
    // 更新会话信息的API
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        updateSession(data.sessionId, data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Session updated'
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid JSON data'
        }));
      }
    });
  }
  else if (req.url === '/api/simulate' && req.method === 'POST') {
    // 测试用的模拟API - 生成空数据结构供测试
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Simulate API ready - send real intercept data via /api/intercept',
      note: 'Session and Intent data should come from Agent CLI, not simulated'
    }));
  }
  else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// 🌐 启动Web服务器
function startWebServer() {
  server.listen(PORT, () => {
    console.log(`✅ Web监控界面已启动: http://localhost:${PORT}`);
  });
}

// 🔗 启动Hook服务器
function startHookServer() {
  hookServer.listen(HOOK_PORT, '127.0.0.1', () => {
    console.log(`✅ Hook Daemon已启动: http://localhost:${HOOK_PORT}`);

    // 显示完整启动信息
    showStartupBanner();
  });
}

// 📊 显示启动横幅
function showStartupBanner() {
  console.log('');
  console.log('🛡️ Aegis 真实监控系统已启动');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 监控界面: http://localhost:${PORT}`);
  console.log(`📡 WebSocket服务: ws://localhost:${WS_PORT}`);
  console.log(`🔗 Hook后端: http://localhost:${HOOK_PORT}`);
  console.log('📋 支持的Agent CLI:');
  console.log('   • Hermes (🔥)');
  console.log('   • OpenClaw (🔧)');
  console.log('   • Claude Code (🤖)');
  console.log('   • GitHub Codex (💻)');
  console.log('   • GPT-4 (🧠)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('💡 Dark Minimal UI + Hook拦截功能已就绪');
  console.log(`📝 端口配置已保存到: ./aegis-ports.md`);

  // 生成端口配置文档
  try {
    const configDoc = generatePortConfig({ web: PORT, websocket: WS_PORT, hook: HOOK_PORT });
    fs.writeFileSync('./aegis-ports.md', configDoc);
  } catch (e) {
    console.log('⚠️ 无法保存端口配置文档');
  }
}

// Hook Daemon 服务器 (动态端口)
hookServer = http.createServer((req, res) => {
  // CORS设置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/hook-event' && req.method === 'POST') {
    handleHookEvent(req, res);
  } else if (req.url === '/api/approval' && req.method === 'POST') {
    handleApprovalRequest(req, res);
  } else if (req.url === '/status' && req.method === 'GET') {
    handleHookStatus(req, res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Hook服务器配置已移至startHookServer()函数

// 🔒 处理Hook事件（支持交互式审批）
async function handleHookEvent(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const event = JSON.parse(body);

      // 提取真实的session ID
      const realSessionId = event.sessionId ||
                           event.payload?.sessionId ||
                           event.context?.sessionId ||
                           `hook-${Date.now()}`;

      console.log(`📡 Hook事件: ${event.type || 'approval_request'} - Session: ${realSessionId.substring(0, 8)}... - Intent: ${event.intent || 'unknown'}`);

      // 🔒 根据AST引擎结果映射风险级别
      function mapSeverityToRisk(astResult) {
        if (!astResult || !astResult.severity) return 'MEDIUM';

        switch (astResult.severity) {
          case 'block': return 'CRITICAL';  // 立即阻止
          case 'error': return 'HIGH';      // 需要审批
          case 'warn':  return 'MEDIUM';    // 警告但允许
          default:      return 'LOW';       // 安全命令
        }
      }

      // 🔒 交互式审批处理
      const astResult = event.context?.astResult || {};
      const mappedRisk = mapSeverityToRisk(astResult);

      const approvalData = {
        sessionId: realSessionId,
        command: event.command || event.payload?.command || 'unknown',
        risk: event.risk || mappedRisk,
        intent: event.intent || 'unknown_intent',
        agentType: event.agentType || event.payload?.agentType || 'claude-code',
        context: {
          cwd: event.cwd || event.payload?.cwd || process.cwd(),
          user: event.context?.user || event.payload?.context?.user || 'unknown',
          project: event.context?.project || event.payload?.context?.project || 'unknown',
          astSeverity: astResult.severity,
          astDescription: astResult.description
        }
      };

      // 🔒 检查是否已被AST引擎拒绝
      let approvalResult;
      let eventStatus;


      if (event.decision === 'DENY' || event.action === 'block') {
        // 命令已被AST引擎拒绝，无需审批
        approvalResult = {
          approved: false,
          reason: event.context?.astResult?.description || 'Blocked by security rules',
          timestamp: new Date().toISOString(),
          source: 'ast-engine'
        };
        eventStatus = 'blocked';
      } else {
        // 需要用户审批的命令 - 设置为pending状态
        eventStatus = 'pending';

        // 先广播pending状态到界面
        broadcast({
          type: 'approval_request',
          sessionId: realSessionId,
          command: approvalData.command,
          agent: approvalData.agentType,
          risk: approvalData.risk,
          status: 'pending',
          userContext: {
            ...event.context,
            ...event.payload?.context,
          },
          timestamp: new Date().toISOString(),
          astResult: astResult
        });

        // 创建一个Promise来等待Web界面的审批决定
        const webApprovalPromise = new Promise((resolve, reject) => {
          // 存储审批回调以便Web接口调用
          pendingApprovals.set(realSessionId, { resolve, reject, timestamp: Date.now() });

          // 60秒超时保护
          setTimeout(() => {
            const pending = pendingApprovals.get(realSessionId);
            if (pending) {
              pendingApprovals.delete(realSessionId);
              pending.reject(new Error('Approval timeout'));
            }
          }, 60000);
        });

        // 等待Web审批结果
        webApprovalPromise.then(approvalResult => {
          const finalStatus = approvalResult.approved ? 'allowed' : 'blocked';
          updateEventStatus(realSessionId, finalStatus, approvalResult.reason);
        }).catch(error => {
          updateEventStatus(realSessionId, 'blocked', 'Approval timeout or error');
        });

        // 等待Web审批决定
        try {
          approvalResult = await webApprovalPromise;
          console.log(`✅ [${new Date().toLocaleTimeString()}] Web approval resolved for session ${realSessionId.substring(0, 8)}... - Decision: ${approvalResult.approved ? 'ALLOW' : 'DENY'}`);
        } catch (error) {
          console.log(`❌ [${new Date().toLocaleTimeString()}] Web approval failed for session ${realSessionId.substring(0, 8)}... - ${error.message}`);
          approvalResult = { approved: false, reason: 'Approval timeout or error' };
        }
      }

      // 转换为监控系统格式并添加事件
      const monitorEvent = {
        command: approvalData.command,
        agent: approvalData.agentType,
        risk: approvalData.risk,
        status: eventStatus,
        sessionId: realSessionId,
        userContext: {
          ...event.context,
          ...event.payload?.context,
          user: event.context?.user || 'claude-user',
          project: event.cwd ? event.cwd.split('/').pop() : 'unknown'
        },
        intent: event.intent || event.payload?.intent || 'unknown_intent'
      };

      addInterceptionEvent(monitorEvent);

      // 更新session信息
      if (realSessionId && realSessionId !== `hook-${Date.now()}`) {
        updateSession(realSessionId, {
          user: monitorEvent.userContext.user,
          project: monitorEvent.userContext.project,
          lastUpdate: new Date().toISOString(),
          cwd: event.cwd || process.cwd(),
          agent: monitorEvent.agent
        });
      }

      // 🔒 响应Hook（包含审批结果）
      const responseCode = approvalResult.approved ? 200 : 403;
      res.writeHead(responseCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: approvalResult.approved,
        approved: approvalResult.approved,
        reason: approvalResult.reason,
        timestamp: approvalResult.timestamp,
        sessionId: realSessionId,
        command: approvalData.command,
        risk: approvalData.risk,
        message: approvalResult.approved
          ? '✅ Command approved by user'
          : '❌ Command blocked - ' + approvalResult.reason
      }));

    } catch (error) {
      console.error('Hook事件处理错误:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

// 处理Hook状态
function handleHookStatus(req, res) {
  const status = {
    service: 'aegis-hook-daemon',
    status: 'running',
    pid: process.pid,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    ports: { backend: HOOK_PORT, web: PORT, websocket: WS_PORT }
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(status, null, 2));
}

// 清理函数
process.on('SIGINT', () => {
  console.log('\n🛑 正在停止监控系统...');
  wss.close(() => {
    console.log('📡 WebSocket服务器已停止');
  });
  server.close(() => {
    console.log('🌐 HTTP服务器已停止');
  });
  hookServer.close(() => {
    console.log('🔗 Hook服务器已停止');
    console.log('✅ Aegis 监控系统已停止');
    process.exit(0);
  });
});

// 🚀 启动Aegis服务
if (require.main === module) {
  startAegisServices();
}

function updateEventStatus(sessionId, newStatus, reason) {
  // 广播状态更新事件
  broadcast({
    type: 'approval_resolved',
    sessionId: sessionId,
    status: newStatus,
    reason: reason,
    timestamp: new Date().toISOString()
  });

  console.log(`🛡️ [${new Date().toLocaleTimeString()}] ${newStatus.toUpperCase()}: Approval ${newStatus} for session ${sessionId.substring(0, 8)}...`);
}

async function handleApprovalRequest(req, res) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const { sessionId, approved } = JSON.parse(body);
      const newStatus = approved ? 'allowed' : 'blocked';
      const reason = approved ? 'Approved by user via web interface' : 'Denied by user via web interface';

      // 🔥 关键：解决待审批Promise，让Hook继续执行
      const pendingApproval = pendingApprovals.get(sessionId);
      if (pendingApproval) {
        pendingApprovals.delete(sessionId);
        pendingApproval.resolve({ approved, reason });
        console.log(`🔄 [${new Date().toLocaleTimeString()}] Resolved pending approval for session ${sessionId.substring(0, 8)}... - Decision: ${approved ? 'ALLOW' : 'DENY'}`);
      } else {
        console.log(`⚠️ [${new Date().toLocaleTimeString()}] No pending approval found for session ${sessionId.substring(0, 8)}... (may have timed out)`);
      }

      // 更新事件状态
      updateEventStatus(sessionId, newStatus, reason);

      // 响应客户端
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        sessionId: sessionId,
        status: newStatus,
        message: `Command ${newStatus} successfully`,
        hookResumed: !!pendingApproval
      }));

      console.log(`🛡️ [${new Date().toLocaleTimeString()}] User ${approved ? 'APPROVED' : 'DENIED'} session ${sessionId.substring(0, 8)}... via web interface`);

    } catch (error) {
      console.error('Approval request error:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Invalid approval request'
      }));
    }
  });
}

module.exports = {
  addInterceptionEvent,
  updateSession,
  updateActiveAgent,
  startAegisServices,
  updateEventStatus
};