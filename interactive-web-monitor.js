#!/usr/bin/env node
/**
 * Aegis Interactive Web Monitor - 支持Web端交互式拦截决策
 * 特点：用户可以在Web界面选择 Allow/Deny/Session/Ways/Info
 */

const http = require('http');
const net = require('net');

const WEB_PORT = 3001;
const AEGIS_HOST = '127.0.0.1';
const AEGIS_PORT = 9876;

// 存储数据
let events = [];
let connections = [];
let stats = { blocked: 0, allowed: 0, warning: 0, info: 0, total: 0 };
let pendingRequests = new Map(); // 待决策的请求

// 语言包
const i18n = {
  'zh': {
    title: '🛡️ Aegis 交互式安全监控',
    subtitle: 'AI代理交互式安全拦截系统',
    decision_modal_title: '⚠️ 安全决策需要',
    decision_command: '检测到的命令',
    decision_risk: '风险评估',
    decision_suggestion: '建议操作',
    decision_allow: '允许 (A)',
    decision_deny: '拒绝 (D)',
    decision_session: '会话允许 (S)',
    decision_ways: '查看方案 (W)',
    decision_info: '详细信息 (I)',
    pending_decisions: '待决策',
    auto_deny_timer: '自动拒绝倒计时'
  },
  'en': {
    title: '🛡️ Aegis Interactive Security Monitor',
    subtitle: 'AI Agent Interactive Security Interception System',
    decision_modal_title: '⚠️ Security Decision Required',
    decision_command: 'Detected Command',
    decision_risk: 'Risk Assessment',
    decision_suggestion: 'Recommendation',
    decision_allow: 'Allow (A)',
    decision_deny: 'Deny (D)',
    decision_session: 'Session Allow (S)',
    decision_ways: 'View Alternatives (W)',
    decision_info: 'Details (I)',
    pending_decisions: 'Pending Decisions',
    auto_deny_timer: 'Auto-deny Timer'
  }
};

// 添加事件
function addEvent(type, message, command = '', agent = 'Claude Code', requestId = null) {
  const event = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toLocaleString('zh-CN'),
    type,
    message,
    command: command.substring(0, 120),
    agent,
    time: new Date().toLocaleTimeString(),
    requestId
  };

  events.unshift(event);
  if (events.length > 50) {
    events = events.slice(0, 50);
  }

  stats[type]++;
  stats.total++;

  broadcastEvent(event);
  console.log(`\n🛡️ [${event.time}] ${type.toUpperCase()}: ${message}`);
}

// 广播事件
function broadcastEvent(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  connections.forEach((res, index) => {
    try {
      res.write(data);
    } catch (e) {
      connections.splice(index, 1);
    }
  });
}

// 广播待决策请求
function broadcastDecisionRequest(requestData) {
  const data = `data: ${JSON.stringify({
    type: 'decision_request',
    ...requestData
  })}\n\n`;
  connections.forEach((res, index) => {
    try {
      res.write(data);
    } catch (e) {
      connections.splice(index, 1);
    }
  });
}

// 模拟拦截决策请求
function simulateInterception(command, agent = 'Claude Code') {
  const requestId = Date.now().toString();
  const riskLevel = calculateRiskLevel(command);

  const requestData = {
    requestId,
    command,
    agent,
    timestamp: new Date().toLocaleString('zh-CN'),
    riskLevel,
    suggestion: generateSuggestion(command, riskLevel),
    alternatives: generateAlternatives(command)
  };

  pendingRequests.set(requestId, requestData);

  // 广播决策请求
  broadcastDecisionRequest(requestData);

  // 30秒后自动拒绝
  setTimeout(() => {
    if (pendingRequests.has(requestId)) {
      handleDecision(requestId, 'deny', '自动拒绝（超时）');
    }
  }, 30000);

  console.log(`\n⚠️ 交互式拦截: ${command}`);
  console.log(`🎯 Agent: ${agent}, Risk: ${riskLevel}`);
  console.log(`💡 等待Web界面用户决策...`);

  return requestId;
}

// 处理用户决策
function handleDecision(requestId, decision, reason = '') {
  const request = pendingRequests.get(requestId);
  if (!request) return;

  pendingRequests.delete(requestId);

  let eventType, message;
  switch (decision) {
    case 'allow':
      eventType = 'allowed';
      message = `用户允许执行: ${request.command}`;
      break;
    case 'session':
      eventType = 'allowed';
      message = `会话允许: ${request.command} (本次会话有效)`;
      break;
    case 'deny':
    default:
      eventType = 'blocked';
      message = `用户拒绝执行: ${request.command}`;
      break;
  }

  addEvent(eventType, message, request.command, request.agent, requestId);

  // 广播决策结果
  broadcastEvent({
    type: 'decision_result',
    requestId,
    decision,
    reason,
    timestamp: new Date().toLocaleString('zh-CN')
  });
}

// 计算风险等级
function calculateRiskLevel(command) {
  const highRiskPatterns = [
    /rm\s+.*-rf?\s+\//,
    /git\s+push.*--force/,
    /git\s+reset.*--hard/,
    /chmod\s+777/,
    /sudo.*rm/
  ];

  const mediumRiskPatterns = [
    /git\s+clean\s+.*-f/,
    /npm\s+install.*--unsafe/,
    /curl.*\|\s*sh/
  ];

  for (const pattern of highRiskPatterns) {
    if (pattern.test(command)) return 'HIGH';
  }

  for (const pattern of mediumRiskPatterns) {
    if (pattern.test(command)) return 'MEDIUM';
  }

  return 'LOW';
}

// 生成建议
function generateSuggestion(command, riskLevel) {
  const suggestions = {
    HIGH: '⚠️ 高危操作！建议仔细检查命令，考虑备份重要数据',
    MEDIUM: '⚡ 中等风险，建议确认操作范围和影响',
    LOW: '💡 低风险操作，通常可以安全执行'
  };
  return suggestions[riskLevel] || suggestions.LOW;
}

// 生成替代方案
function generateAlternatives(command) {
  if (command.includes('rm -rf')) {
    return ['先备份文件', '使用 ls 确认路径', '考虑使用 mv 到回收站'];
  }
  if (command.includes('git push --force')) {
    return ['使用 git push --force-with-lease', '先 git pull --rebase', '创建新分支推送'];
  }
  if (command.includes('git reset --hard')) {
    return ['使用 git stash', '先 git diff 查看变更', '创建临时分支保存'];
  }
  return ['请谨慎操作', '确认命令无误', '考虑测试环境验证'];
}

// 生成HTML页面
function getHTML() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🛡️ Aegis 交互式安全监控</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0A0F1C;
            --bg-secondary: #111827;
            --bg-tertiary: #1F2937;
            --bg-card: #111827;
            --bg-hover: #1F2937;
            --accent-primary: #3B82F6;
            --accent-secondary: #8B5CF6;
            --accent-success: #10B981;
            --accent-warning: #F59E0B;
            --accent-danger: #EF4444;
            --accent-info: #06B6D4;
            --text-primary: #F9FAFB;
            --text-secondary: #D1D5DB;
            --text-muted: #9CA3AF;
            --border-color: #374151;
            --border-hover: #4B5563;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            line-height: 1.6;
        }

        /* 科技感背景 */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                        radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
            pointer-events: none;
            z-index: -1;
        }

        /* 主布局 */
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }

        /* 标题栏 */
        .header {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            text-align: center;
        }

        .title {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .subtitle {
            color: var(--text-muted);
            font-size: 16px;
        }

        /* 统计卡片 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 24px;
        }

        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--card-accent, var(--accent-primary));
        }

        .stat-card.blocked { --card-accent: var(--accent-danger); }
        .stat-card.allowed { --card-accent: var(--accent-success); }
        .stat-card.warning { --card-accent: var(--accent-warning); }
        .stat-card.pending { --card-accent: var(--accent-info); }

        .stat-value {
            font-size: 36px;
            font-weight: 800;
            margin-bottom: 8px;
        }

        .stat-label {
            color: var(--text-muted);
            font-size: 14px;
            font-weight: 500;
        }

        /* 主要内容区 */
        .main-content {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 24px;
        }

        /* 事件列表 */
        .events-container {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            overflow: hidden;
        }

        .events-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-color);
            font-size: 18px;
            font-weight: 600;
        }

        .events-list {
            max-height: 500px;
            overflow-y: auto;
        }

        .event-item {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 24px;
            border-bottom: 1px solid var(--border-color);
        }

        .event-item:last-child {
            border-bottom: none;
        }

        .event-status {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
        }

        .event-blocked .event-status { background: rgba(239, 68, 68, 0.1); color: var(--accent-danger); }
        .event-allowed .event-status { background: rgba(16, 185, 129, 0.1); color: var(--accent-success); }
        .event-warning .event-status { background: rgba(245, 158, 11, 0.1); color: var(--accent-warning); }
        .event-info .event-status { background: rgba(6, 182, 212, 0.1); color: var(--accent-info); }

        .event-content {
            flex: 1;
        }

        .event-message {
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 4px;
        }

        .event-details {
            font-size: 12px;
            color: var(--text-muted);
        }

        /* 待决策面板 */
        .decisions-container {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            overflow: hidden;
        }

        .decisions-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-color);
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .pending-count {
            background: var(--accent-warning);
            color: white;
            font-size: 12px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 12px;
            min-width: 20px;
            text-align: center;
        }

        .decisions-list {
            max-height: 500px;
            overflow-y: auto;
        }

        /* 决策卡片 */
        .decision-card {
            margin: 20px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-hover);
            border-radius: 12px;
            overflow: hidden;
            animation: slideIn 0.3s ease;
        }

        .decision-header {
            padding: 16px 20px;
            background: rgba(245, 158, 11, 0.1);
            border-bottom: 1px solid var(--border-color);
        }

        .decision-title {
            font-weight: 600;
            color: var(--accent-warning);
            margin-bottom: 8px;
        }

        .decision-command {
            font-family: 'Monaco', 'Consolas', monospace;
            background: rgba(0, 0, 0, 0.3);
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            word-break: break-all;
        }

        .decision-body {
            padding: 20px;
        }

        .decision-info {
            margin-bottom: 16px;
        }

        .decision-risk {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .risk-high { background: rgba(239, 68, 68, 0.2); color: var(--accent-danger); }
        .risk-medium { background: rgba(245, 158, 11, 0.2); color: var(--accent-warning); }
        .risk-low { background: rgba(16, 185, 129, 0.2); color: var(--accent-success); }

        .decision-suggestion {
            color: var(--text-secondary);
            font-size: 14px;
            margin: 8px 0;
        }

        .decision-buttons {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-top: 16px;
        }

        .decision-btn {
            padding: 12px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            background: var(--bg-secondary);
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 13px;
            font-weight: 500;
            text-align: center;
        }

        .decision-btn:hover {
            background: var(--bg-hover);
            border-color: var(--border-hover);
            color: var(--text-primary);
        }

        .decision-btn.allow { border-color: var(--accent-success); color: var(--accent-success); }
        .decision-btn.deny { border-color: var(--accent-danger); color: var(--accent-danger); }

        .decision-timer {
            text-align: center;
            margin-top: 12px;
            color: var(--text-muted);
            font-size: 12px;
        }

        /* 空状态 */
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--text-muted);
        }

        .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        /* 动画 */
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* 响应式 */
        @media (max-width: 1024px) {
            .main-content {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- 标题栏 -->
        <div class="header">
            <h1 class="title" data-lang-key="title">🛡️ Aegis 交互式安全监控</h1>
            <p class="subtitle" data-lang-key="subtitle">AI代理交互式安全拦截系统</p>
        </div>

        <!-- 统计卡片 -->
        <div class="stats-grid">
            <div class="stat-card blocked">
                <div class="stat-value" id="blocked-count">0</div>
                <div class="stat-label">已拦截</div>
            </div>
            <div class="stat-card allowed">
                <div class="stat-value" id="allowed-count">0</div>
                <div class="stat-label">已允许</div>
            </div>
            <div class="stat-card warning">
                <div class="stat-value" id="warning-count">0</div>
                <div class="stat-label">警告</div>
            </div>
            <div class="stat-card pending">
                <div class="stat-value" id="pending-count">0</div>
                <div class="stat-label" data-lang-key="pending_decisions">待决策</div>
            </div>
        </div>

        <div class="main-content">
            <!-- 事件历史 -->
            <div class="events-container">
                <div class="events-header">📋 事件历史</div>
                <div class="events-list" id="events-list">
                    <div class="empty-state">
                        <div class="empty-icon">👁️</div>
                        <div>等待安全事件...</div>
                    </div>
                </div>
            </div>

            <!-- 待决策面板 -->
            <div class="decisions-container">
                <div class="decisions-header">
                    ⚠️ <span data-lang-key="pending_decisions">待决策</span>
                    <span class="pending-count" id="pending-count-badge">0</span>
                </div>
                <div class="decisions-list" id="decisions-list">
                    <div class="empty-state">
                        <div class="empty-icon">🛡️</div>
                        <div>没有待决策的安全事件</div>
                        <p style="margin-top: 8px; font-size: 12px;">危险命令将在这里等待您的决策</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let eventCounts = { blocked: 0, allowed: 0, warning: 0, info: 0 };
        let pendingCount = 0;
        let currentLang = 'zh';

        // SSE连接
        const eventSource = new EventSource('/events');

        eventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'decision_request') {
                    addDecisionRequest(data);
                } else if (data.type === 'decision_result') {
                    removeDecisionRequest(data.requestId);
                } else {
                    addEventToUI(data);
                }
            } catch (e) {
                console.error('解析事件数据失败:', e);
            }
        };

        // 添加决策请求
        function addDecisionRequest(requestData) {
            const decisionsList = document.getElementById('decisions-list');

            // 移除空状态
            if (decisionsList.querySelector('.empty-state')) {
                decisionsList.innerHTML = '';
            }

            const decisionDiv = document.createElement('div');
            decisionDiv.className = 'decision-card';
            decisionDiv.id = \`decision-\${requestData.requestId}\`;

            decisionDiv.innerHTML = \`
                <div class="decision-header">
                    <div class="decision-title">⚠️ 检测到危险操作</div>
                    <div class="decision-command">\${requestData.command}</div>
                </div>
                <div class="decision-body">
                    <div class="decision-info">
                        <div class="decision-risk risk-\${requestData.riskLevel.toLowerCase()}">
                            风险等级: \${requestData.riskLevel}
                        </div>
                        <div class="decision-suggestion">\${requestData.suggestion}</div>
                    </div>
                    <div class="decision-buttons">
                        <button class="decision-btn allow" onclick="makeDecision('\${requestData.requestId}', 'allow')">
                            ✅ 允许 (A)
                        </button>
                        <button class="decision-btn deny" onclick="makeDecision('\${requestData.requestId}', 'deny')">
                            ❌ 拒绝 (D)
                        </button>
                        <button class="decision-btn" onclick="makeDecision('\${requestData.requestId}', 'session')">
                            ⏱️ 会话 (S)
                        </button>
                    </div>
                    <div class="decision-timer" id="timer-\${requestData.requestId}">
                        自动拒绝倒计时: <span id="countdown-\${requestData.requestId}">30</span>秒
                    </div>
                </div>
            \`;

            decisionsList.appendChild(decisionDiv);

            // 启动倒计时
            startCountdown(requestData.requestId, 30);

            pendingCount++;
            updatePendingCount();
        }

        // 移除决策请求
        function removeDecisionRequest(requestId) {
            const element = document.getElementById(\`decision-\${requestId}\`);
            if (element) {
                element.remove();
                pendingCount--;
                updatePendingCount();

                // 如果没有待决策项目，显示空状态
                const decisionsList = document.getElementById('decisions-list');
                if (decisionsList.children.length === 0) {
                    decisionsList.innerHTML = \`
                        <div class="empty-state">
                            <div class="empty-icon">🛡️</div>
                            <div>没有待决策的安全事件</div>
                            <p style="margin-top: 8px; font-size: 12px;">危险命令将在这里等待您的决策</p>
                        </div>
                    \`;
                }
            }
        }

        // 倒计时
        function startCountdown(requestId, seconds) {
            const countdownElement = document.getElementById(\`countdown-\${requestId}\`);
            let remaining = seconds;

            const interval = setInterval(() => {
                remaining--;
                if (countdownElement) {
                    countdownElement.textContent = remaining;
                }

                if (remaining <= 0) {
                    clearInterval(interval);
                }
            }, 1000);
        }

        // 做决策
        function makeDecision(requestId, decision) {
            fetch('/decision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, decision })
            });
        }

        // 更新待决策计数
        function updatePendingCount() {
            document.getElementById('pending-count').textContent = pendingCount;
            document.getElementById('pending-count-badge').textContent = pendingCount;
        }

        // 添加事件到UI
        function addEventToUI(event) {
            const eventsList = document.getElementById('events-list');

            if (eventsList.querySelector('.empty-state')) {
                eventsList.innerHTML = '';
            }

            const eventDiv = document.createElement('div');
            eventDiv.className = \`event-item event-\${event.type}\`;

            const icons = { blocked: '🛡️', allowed: '✅', warning: '⚠️', info: '💡' };

            eventDiv.innerHTML = \`
                <div class="event-status">\${icons[event.type] || '📝'}</div>
                <div class="event-content">
                    <div class="event-message">\${event.message}</div>
                    <div class="event-details">🎯 \${event.agent} • ⏰ \${event.timestamp}</div>
                </div>
            \`;

            eventsList.insertBefore(eventDiv, eventsList.firstChild);

            // 更新统计
            eventCounts[event.type]++;
            updateStats();

            // 保持最多20个事件
            while (eventsList.children.length > 20) {
                eventsList.removeChild(eventsList.lastChild);
            }
        }

        // 更新统计
        function updateStats() {
            document.getElementById('blocked-count').textContent = eventCounts.blocked;
            document.getElementById('allowed-count').textContent = eventCounts.allowed;
            document.getElementById('warning-count').textContent = eventCounts.warning;
        }

        // 键盘快捷键支持
        document.addEventListener('keydown', function(e) {
            if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') return;

            // 获取第一个待决策项目
            const firstDecision = document.querySelector('.decision-card');
            if (!firstDecision) return;

            const requestId = firstDecision.id.replace('decision-', '');

            switch(e.key.toLowerCase()) {
                case 'a':
                    makeDecision(requestId, 'allow');
                    break;
                case 'd':
                    makeDecision(requestId, 'deny');
                    break;
                case 's':
                    makeDecision(requestId, 'session');
                    break;
            }
        });

        // 初始化
        setTimeout(() => {
            addEventToUI({
                type: 'info',
                message: '交互式安全监控已启动',
                agent: 'System',
                timestamp: new Date().toLocaleString('zh-CN')
            });
        }, 1000);
    </script>
</body>
</html>`;
}

// 创建Web服务器
async function createInteractiveMonitor() {
  const server = http.createServer(async (req, res) => {
    const url = req.url;

    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHTML());
    }
    else if (url === '/events') {
      // SSE endpoint
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      connections.push(res);

      // 发送连接成功事件
      res.write(`data: ${JSON.stringify({
        type: 'info',
        message: '连接已建立',
        agent: 'Web Monitor',
        timestamp: new Date().toLocaleString('zh-CN'),
        time: new Date().toLocaleTimeString()
      })}\n\n`);

      req.on('close', () => {
        const index = connections.indexOf(res);
        if (index !== -1) {
          connections.splice(index, 1);
        }
      });
    }
    else if (url === '/decision' && req.method === 'POST') {
      // 处理用户决策
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const { requestId, decision } = JSON.parse(body);
          handleDecision(requestId, decision);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"status":"ok"}');
        } catch (e) {
          res.writeHead(400);
          res.end('{"error":"invalid json"}');
        }
      });
    }
    else if (url === '/simulate-intercept' && req.method === 'POST') {
      // 模拟拦截测试
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const { command, agent } = JSON.parse(body);
          const requestId = simulateInterception(command, agent);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ requestId }));
        } catch (e) {
          res.writeHead(400);
          res.end('{"error":"invalid json"}');
        }
      });
    }
    else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(WEB_PORT, () => {
    console.log('🚀 Aegis 交互式Web监控已启动');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 监控界面: http://localhost:${WEB_PORT}`);
    console.log(`⚡ 特性: 交互式拦截决策 + 实时Web界面`);
    console.log(`⌨️  快捷键: A(允许) D(拒绝) S(会话)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  });

  return { server, addEvent, simulateInterception };
}

// 主函数
async function main() {
  console.log('🛡️ 启动 Aegis 交互式监控...');

  const { server, addEvent: addEventFn, simulateInterception: simulateFn } = await createInteractiveMonitor();

  // 演示交互式拦截
  setTimeout(() => {
    addEventFn('info', '交互式监控已启动', '', 'System');
  }, 2000);

  setTimeout(() => {
    console.log('🎯 模拟危险命令拦截...');
    simulateFn('git push --force origin main', 'Claude Code');
  }, 4000);

  setTimeout(() => {
    simulateFn('rm -rf /Users/test', 'Hermes');
  }, 8000);

  setTimeout(() => {
    simulateFn('chmod 777 /etc/passwd', 'GPT-4');
  }, 12000);

  process.on('SIGINT', () => {
    console.log('\n👋 交互式监控停止中...');
    server.close(() => {
      console.log('✅ 交互式监控已停止');
      process.exit(0);
    });
  });

  // 导出全局函数
  global.aegisAddEvent = addEventFn;
  global.aegisSimulateIntercept = simulateFn;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createInteractiveMonitor, addEvent, simulateInterception };