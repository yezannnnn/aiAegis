#!/usr/bin/env node
/**
 * Aegis Security Monitor - Cyberpunk Matrix Edition
 * 设计理念：Cyberpunk UI、黑客美学、Matrix绿色终端风格
 */

const http = require('http');

const WEB_PORT = 3001;

// 存储数据
let events = [];
let connections = [];
let stats = { blocked: 0, allowed: 0, warning: 0, info: 0, total: 0 };
let pendingDecisions = new Map();

// ✅ 安全加固: 资源清理机制
setInterval(() => {
  const now = Date.now();

  // 清理超时的决策请求 (超过5分钟)
  for (const [id, decision] of pendingDecisions) {
    if (now - new Date(decision.request.timestamp).getTime() > 300000) {
      console.log(`⏰ 清理超时决策请求: ${id}`);

      // 响应超时错误给客户端
      try {
        decision.res.writeHead(408, { 'Content-Type': 'application/json' });
        decision.res.end(JSON.stringify({ error: '决策请求超时' }));
      } catch (e) {
        // 连接可能已经关闭，忽略错误
      }

      pendingDecisions.delete(id);
    }
  }

  // 清理无效的SSE连接
  connections = connections.filter(conn => {
    try {
      return !conn.destroyed && conn.writable;
    } catch (e) {
      return false;
    }
  });

  console.log(`📊 活跃连接: ${connections.length}, 待决策: ${pendingDecisions.size}`);
}, 30000); // 每30秒清理一次

// ✅ 安全加固: 输入清理函数
function sanitizeInput(input) {
  if (typeof input !== 'string') return String(input || '');

  // 移除危险字符，保留基本内容
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 控制字符
    .replace(/[\u200B-\u200D\uFEFF]/g, '')             // 零宽字符
    .slice(0, 1000); // 限制长度
}

// 添加事件
function addEvent(type, message, command = '', agent = 'Claude Code') {
  const event = {
    id: Date.now() + Math.random(),
    type: sanitizeInput(type),
    message: sanitizeInput(message),
    command: sanitizeInput(command),
    agent: sanitizeInput(agent),
    timestamp: new Date().toISOString()
  };

  events.unshift(event); // 新事件在顶部
  if (events.length > 200) events.pop(); // 保留最近200个事件

  // 更新统计
  stats[type] = (stats[type] || 0) + 1;
  stats.total++;

  // 广播给所有连接的客户端
  broadcastEvent({ type: 'event', data: event });
}

// 广播事件
function broadcastEvent(data) {
  connections.forEach(conn => {
    try {
      conn.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      // 连接已关闭，忽略错误
    }
  });
}

// 生成奢华极简主义界面HTML (Frontend Design Skill - Luxurious Minimalism)
function getCyberSecHTML() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>暗夜线条简约风格 - UI预览</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            /* 暗夜线条简约配色 */
            --bg-primary: #0F172A;
            --bg-card: rgba(255, 255, 255, 0.02);
            --accent-green: #22C55E;
            --text-primary: #FFFFFF;
            --text-secondary: rgba(255, 255, 255, 0.7);
            --border: rgba(255, 255, 255, 0.08);
            --border-accent: rgba(34, 197, 94, 0.3);
            --danger: #DC2626;
            --warning: #F59E0B;
        }

        @media (prefers-reduced-motion: reduce) {
            * {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Fira Sans', system-ui, monospace;
            font-weight: 400;
            background: var(--color-background);
            color: var(--color-foreground);
            line-height: 1.5;
            overflow-x: hidden;
            position: relative;
        }

        /* Matrix Rain Animation Background */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background:
                linear-gradient(90deg, transparent 97%, rgba(0, 255, 65, 0.03) 100%),
                linear-gradient(0deg, transparent 97%, rgba(0, 255, 65, 0.03) 100%);
            background-size: 20px 20px;
            pointer-events: none;
            z-index: -2;
            opacity: 0.8;
            animation: matrix-scan 10s linear infinite;
        }

        @keyframes matrix-scan {
            0% { transform: translateY(0); }
            100% { transform: translateY(100px); }
        }

        /* Scanlines Effect */
        body::after {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(
                transparent 50%,
                rgba(0, 255, 65, 0.02) 50%
            );
            background-size: 100% 4px;
            pointer-events: none;
            z-index: -1;
            opacity: 0.6;
        }

        /* Main Container - Terminal Style */
        .container {
            min-height: 100vh;
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
            background: rgba(13, 13, 13, 0.9);
            border: 1px solid var(--color-border);
            position: relative;
            backdrop-filter: blur(10px);
        }

        .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border: 2px solid var(--color-primary);
            opacity: 0.3;
            pointer-events: none;
            animation: border-glow 3s ease-in-out infinite alternate;
        }

        @keyframes border-glow {
            0% { opacity: 0.2; }
            100% { opacity: 0.6; }
        }

        /* Terminal Header */
        .header {
            padding: 2rem 0;
            border-bottom: 1px solid var(--color-border);
            margin-bottom: 2rem;
            position: relative;
        }

        /* Command Center Layout */
        .command-center {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 3rem;
            align-items: start;
        }

        /* Cyberpunk Brand Identity */
        .logo-section {
            position: relative;
        }

        .logo-section .title {
            font-family: 'Fira Code', monospace;
            font-size: 3rem;
            font-weight: 700;
            color: var(--color-primary);
            text-shadow: var(--glow-primary);
            margin: 0;
            position: relative;
            line-height: 1;
            letter-spacing: 0.05em;
            animation: title-flicker 4s ease-in-out infinite;
        }

        @keyframes title-flicker {
            0%, 95%, 100% { opacity: 1; }
            97% { opacity: 0.8; }
        }

        .logo-section .title::before {
            content: '> ';
            color: var(--color-accent);
            animation: cursor-blink 1s infinite;
        }

        @keyframes cursor-blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }

        .logo-section .subtitle {
            font-family: 'Fira Code', monospace;
            font-size: 0.875rem;
            font-weight: 500;
            color: var(--color-foreground);
            text-transform: uppercase;
            letter-spacing: 0.2em;
            margin: 1rem 0 0 0;
            opacity: 0.8;
        }

        /* Security Status HUD */
        .threat-level-indicator {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            text-align: right;
        }

        .threat-badge {
            background: rgba(13, 13, 13, 0.8);
            border: 1px solid var(--color-primary);
            border-radius: 4px;
            padding: 1rem 1.5rem;
            position: relative;
            transition: var(--transition);
            box-shadow: var(--shadow-neon);
            cursor: pointer;
        }

        .threat-badge::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 2px;
            background: var(--color-primary);
            animation: scan-line 2s linear infinite;
        }

        @keyframes scan-line {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .threat-badge:hover {
            border-color: var(--color-accent);
            box-shadow: var(--shadow-red);
            background: rgba(255, 51, 51, 0.1);
        }

        .threat-label {
            display: block;
            font-family: 'Fira Code', monospace;
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--color-foreground);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 0.5rem;
            opacity: 0.7;
        }

        .threat-value {
            display: block;
            font-family: 'Fira Code', monospace;
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--color-primary);
            text-shadow: var(--glow-primary);
            letter-spacing: 0.05em;
        }

        /* Terminal System Status */
        .system-status {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .status-indicator {
            position: relative;
            width: 24px;
            height: 24px;
        }

        .pulse-ring, .pulse-ring-2 {
            position: absolute;
            width: 24px;
            height: 24px;
            border: 2px solid var(--color-primary);
            border-radius: 50%;
            opacity: 0;
            animation: matrix-pulse 2s ease-out infinite;
        }

        .pulse-ring-2 {
            animation-delay: 1s;
        }

        @keyframes matrix-pulse {
            0% {
                transform: scale(0.1);
                opacity: 1;
            }
            100% {
                transform: scale(1.2);
                opacity: 0;
            }
        }

        .status-dot {
            width: 12px;
            height: 12px;
            background: var(--color-primary);
            border-radius: 50%;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            box-shadow: var(--glow-primary);
            z-index: 1;
        }

        .status-dot::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: var(--color-primary);
            animation: cyber-pulse 1.5s ease-in-out infinite;
        }

        @keyframes cyber-pulse {
            0%, 100% {
                opacity: 1;
                transform: scale(1);
            }
            50% {
                opacity: 0.6;
                transform: scale(1.3);
            }
        }

        .status-text {
            display: flex;
            flex-direction: column;
            font-family: 'Fira Sans', sans-serif;
        }

        .status-text span:first-child {
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--color-foreground);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            opacity: 0.7;
        }

        .status-text span:last-child {
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--color-primary);
            text-shadow: 0 0 5px var(--color-primary);
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 12px;
            background: linear-gradient(135deg, var(--text) 0%, var(--accent) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .header p {
            font-size: 1.125rem;
            color: var(--text-secondary);
            margin-bottom: 32px;
        }

        /* Matrix Status Grid */
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1.5rem;
            margin: 0 0 3rem 0;
            padding: 0;
            background: transparent;
            position: relative;
        }

        /* Cyberpunk HUD Cards */
        .status-card {
            background: rgba(13, 13, 13, 0.9);
            border: 1px solid var(--color-border);
            border-radius: 0;
            padding: 1.5rem;
            text-align: center;
            transition: var(--transition);
            position: relative;
            overflow: hidden;
            cursor: pointer;
            box-shadow: inset 0 0 10px rgba(0, 255, 65, 0.1);
        }

        .status-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 1px;
            background: var(--color-primary);
            transition: var(--transition);
        }

        .status-card::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 2px;
            height: 100%;
            background: var(--color-primary);
            opacity: 0.6;
        }

        .status-card:hover {
            border-color: var(--color-primary);
            background: rgba(0, 255, 65, 0.05);
            box-shadow:
                inset 0 0 20px rgba(0, 255, 65, 0.2),
                0 0 20px rgba(0, 255, 65, 0.3);
        }

        .status-card:hover::before {
            background: var(--color-primary);
            box-shadow: var(--glow-primary);
        }

        .status-number {
            font-family: 'Fira Code', monospace;
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            color: var(--color-primary);
            line-height: 1;
            position: relative;
            text-shadow: var(--glow-primary);
            animation: data-flicker 3s ease-in-out infinite;
        }

        @keyframes data-flicker {
            0%, 95%, 100% { opacity: 1; }
            96%, 98% { opacity: 0.8; }
        }

        .status-number::after {
            content: '';
            position: absolute;
            bottom: -4px;
            left: 50%;
            transform: translateX(-50%);
            width: 20px;
            height: 1px;
            background: var(--color-primary);
            transition: var(--transition);
        }

        .status-label {
            font-family: 'Fira Code', monospace;
            color: var(--color-foreground);
            font-size: 0.75rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            opacity: 0.8;
        }

        /* Matrix Status Color Schemes */
        .status-blocked:hover::before {
            background: var(--critical);
            box-shadow: 0 0 10px var(--critical);
        }

        .status-blocked .status-number {
            color: var(--critical);
            text-shadow: 0 0 10px var(--critical), 0 0 20px var(--critical);
        }

        .status-blocked .status-number::after {
            background: var(--critical);
            box-shadow: var(--shadow-red);
        }

        .status-blocked:hover {
            border-color: var(--critical);
            box-shadow: inset 0 0 20px rgba(255, 23, 68, 0.2);
        }

        .status-allowed:hover::before {
            background: var(--low);
            box-shadow: 0 0 10px var(--low);
        }

        .status-allowed .status-number {
            color: var(--low);
            text-shadow: 0 0 10px var(--low), 0 0 20px var(--low);
        }

        .status-allowed .status-number::after {
            background: var(--low);
        }

        .status-allowed:hover {
            border-color: var(--low);
            box-shadow: inset 0 0 20px rgba(0, 230, 118, 0.2);
        }

        .status-warning:hover::before {
            background: var(--medium);
            box-shadow: 0 0 10px var(--medium);
        }

        .status-warning .status-number {
            color: var(--medium);
            text-shadow: 0 0 10px var(--medium), 0 0 20px var(--medium);
        }

        .status-warning .status-number::after {
            background: var(--medium);
        }

        .status-warning:hover {
            border-color: var(--medium);
            box-shadow: inset 0 0 20px rgba(255, 214, 0, 0.2);
        }

        /* Default card styling */
        .status-card:not(.status-blocked):not(.status-allowed):not(.status-warning):hover::before {
            background: var(--color-primary);
            box-shadow: var(--glow-primary);
        }

        .status-card:not(.status-blocked):not(.status-allowed):not(.status-warning) .status-number {
            color: var(--color-primary);
            text-shadow: var(--glow-primary);
        }

        .status-card:not(.status-blocked):not(.status-allowed):not(.status-warning) .status-number::after {
            background: var(--color-primary);
        }

        .status-card:not(.status-blocked):not(.status-allowed):not(.status-warning):hover {
            border-color: var(--color-primary);
            box-shadow: inset 0 0 20px rgba(0, 255, 65, 0.2);
        }

        /* Command Control Panel */
        .controls {
            background: rgba(13, 13, 13, 0.8);
            border: 1px solid var(--color-border);
            border-radius: 0;
            padding: 1.5rem;
            margin-bottom: 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
            position: relative;
            box-shadow: inset 0 0 10px rgba(0, 255, 65, 0.1);
        }

        .controls::before {
            content: '[ CONTROL INTERFACE ]';
            position: absolute;
            top: -10px;
            left: 1rem;
            background: var(--color-background);
            padding: 0 0.5rem;
            font-family: 'Fira Code', monospace;
            font-size: 0.7rem;
            color: var(--color-primary);
            text-shadow: 0 0 5px var(--color-primary);
        }

        .btn {
            background: rgba(0, 255, 65, 0.1);
            color: var(--color-primary);
            border: 1px solid var(--color-primary);
            border-radius: 0;
            padding: 0.75rem 1.5rem;
            font-weight: 500;
            font-family: 'Fira Code', monospace;
            font-size: 0.875rem;
            cursor: pointer;
            transition: var(--transition);
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            position: relative;
            overflow: hidden;
        }

        .btn::before {
            content: '> ';
            opacity: 0;
            transition: var(--transition);
        }

        .btn:hover {
            background: rgba(0, 255, 65, 0.2);
            box-shadow:
                0 0 10px rgba(0, 255, 65, 0.5),
                inset 0 0 10px rgba(0, 255, 65, 0.2);
            text-shadow: 0 0 5px var(--color-primary);
        }

        .btn:hover::before {
            opacity: 1;
        }

        .btn-secondary {
            background: rgba(255, 51, 51, 0.1);
            color: var(--color-accent);
            border: 1px solid var(--color-accent);
        }

        .btn-secondary:hover {
            background: rgba(255, 51, 51, 0.2);
            box-shadow:
                0 0 10px rgba(255, 51, 51, 0.5),
                inset 0 0 10px rgba(255, 51, 51, 0.2);
            text-shadow: 0 0 5px var(--color-accent);
        }

        /* Terminal Event Feed */
        .events-section {
            background: rgba(13, 13, 13, 0.95);
            border: 1px solid var(--color-border);
            border-radius: 0;
            overflow: hidden;
            box-shadow: inset 0 0 20px rgba(0, 255, 65, 0.1);
            position: relative;
        }

        .events-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: var(--color-primary);
            animation: data-stream 3s linear infinite;
        }

        @keyframes data-stream {
            0% { transform: translateX(-100%); opacity: 0; }
            50% { opacity: 1; }
            100% { transform: translateX(100%); opacity: 0; }
        }

        .section-header {
            background: rgba(0, 255, 65, 0.05);
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: relative;
        }

        .section-header::before {
            content: '[ ';
            color: var(--color-primary);
            font-family: 'Fira Code', monospace;
        }

        .section-header::after {
            content: ' ]';
            color: var(--color-primary);
            font-family: 'Fira Code', monospace;
        }

        .section-title {
            font-family: 'Fira Code', monospace;
            font-size: 1rem;
            font-weight: 600;
            color: var(--color-primary);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            text-shadow: 0 0 5px var(--color-primary);
        }

        .events-list {
            max-height: 600px;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: var(--color-primary) transparent;
        }

        .events-list::-webkit-scrollbar {
            width: 6px;
        }

        .events-list::-webkit-scrollbar-track {
            background: transparent;
        }

        .events-list::-webkit-scrollbar-thumb {
            background: var(--color-primary);
            border-radius: 0;
            box-shadow: 0 0 5px var(--color-primary);
        }

        .event-item {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--color-border);
            display: grid;
            grid-template-columns: auto 1fr auto;
            gap: 1rem;
            align-items: start;
            transition: var(--transition-fast);
            font-family: 'Fira Code', monospace;
            position: relative;
        }

        .event-item::before {
            content: '>';
            color: var(--color-primary);
            position: absolute;
            left: 0.5rem;
            top: 1rem;
            opacity: 0;
            transition: var(--transition-fast);
        }

        .event-item:hover {
            background: rgba(0, 255, 65, 0.05);
            border-color: var(--color-primary);
        }

        .event-item:hover::before {
            opacity: 1;
        }

        .event-item:last-child {
            border-bottom: none;
        }

        .event-indicator {
            width: 8px;
            height: 8px;
            border-radius: 0;
            margin-top: 6px;
            flex-shrink: 0;
            position: relative;
        }

        .event-indicator::after {
            content: '';
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            border: 1px solid currentColor;
            animation: indicator-pulse 2s ease-in-out infinite;
        }

        @keyframes indicator-pulse {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.2); }
        }

        .event-indicator.blocked {
            background: var(--critical);
            color: var(--critical);
            box-shadow: 0 0 8px var(--critical);
        }
        .event-indicator.allowed {
            background: var(--low);
            color: var(--low);
            box-shadow: 0 0 8px var(--low);
        }
        .event-indicator.warning {
            background: var(--medium);
            color: var(--medium);
            box-shadow: 0 0 8px var(--medium);
        }
        .event-indicator.info {
            background: var(--color-primary);
            color: var(--color-primary);
            box-shadow: 0 0 8px var(--color-primary);
        }

        .event-content {
            min-width: 0;
        }

        .event-message {
            font-weight: 500;
            margin-bottom: 0.5rem;
            color: var(--color-foreground);
            font-size: 0.875rem;
        }

        .event-command {
            font-family: 'Fira Code', monospace;
            font-size: 0.8rem;
            color: var(--color-primary);
            background: rgba(0, 255, 65, 0.05);
            border: 1px solid var(--color-border);
            padding: 0.5rem 0.75rem;
            border-radius: 0;
            margin: 0.5rem 0;
            overflow-x: auto;
            text-shadow: 0 0 3px var(--color-primary);
            position: relative;
        }

        .event-command::before {
            content: '$ ';
            color: var(--color-accent);
            font-weight: 700;
        }

        .event-meta {
            font-size: 0.7rem;
            color: var(--color-foreground);
            opacity: 0.6;
            font-family: 'Fira Code', monospace;
        }

        .event-time {
            font-size: 0.7rem;
            color: var(--color-primary);
            text-align: right;
            font-family: 'Fira Code', monospace;
            text-shadow: 0 0 3px var(--color-primary);
        }

        .empty-state {
            padding: 4rem 1.5rem;
            text-align: center;
            color: var(--color-foreground);
            font-family: 'Fira Code', monospace;
            position: relative;
        }

        .empty-state::before {
            content: '[ NO DATA STREAM ]';
            display: block;
            color: var(--color-primary);
            font-weight: 700;
            font-size: 0.875rem;
            margin-bottom: 1rem;
            text-shadow: 0 0 5px var(--color-primary);
            animation: empty-blink 2s ease-in-out infinite;
        }

        @keyframes empty-blink {
            0%, 90%, 100% { opacity: 1; }
            95% { opacity: 0.3; }
        }

        .empty-state-icon {
            font-size: 2rem;
            margin-bottom: 1rem;
            opacity: 0.3;
            color: var(--color-primary);
            filter: blur(1px);
        }

        /* Responsive Cyberpunk Design */
        @media (max-width: 768px) {
            .container {
                padding: 1rem;
                margin: 0;
                max-width: 100%;
            }

            .logo-section .title {
                font-size: 2rem;
            }

            .status-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 1rem;
            }

            .command-center {
                grid-template-columns: 1fr;
                gap: 2rem;
            }

            .threat-level-indicator {
                align-items: flex-start;
                text-align: left;
            }

            .event-item {
                grid-template-columns: 1fr;
                gap: 0.75rem;
                padding: 1rem;
            }

            .event-item::before {
                display: none;
            }

            .event-time {
                text-align: left;
            }
        }

        @media (max-width: 480px) {
            .status-grid {
                grid-template-columns: 1fr;
            }

            .logo-section .title {
                font-size: 1.5rem;
            }

            .container {
                padding: 0.5rem;
            }
        }

        /* Matrix Animation */
        .event-item {
            animation: terminal-slide 0.4s ease-out;
        }

        @keyframes terminal-slide {
            from {
                opacity: 0;
                transform: translateX(-20px);
                filter: blur(2px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
                filter: blur(0);
            }
        }

        /* Glitch Effect on Hover */
        .logo-section .title:hover {
            animation: glitch 0.3s ease-in-out;
        }

        @keyframes glitch {
            0%, 100% { transform: translate(0); }
            20% { transform: translate(-2px, 2px); }
            40% { transform: translate(-2px, -2px); }
            60% { transform: translate(2px, 2px); }
            80% { transform: translate(2px, -2px); }
        }

        /* 在线状态指示器 */
        .online-indicator {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 0.875rem;
            color: var(--success);
        }

        .online-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--success);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- 头部 - Editorial Masthead -->
        <div class="header">
            <div class="command-center">
                <div class="logo-section">
                    <h1 class="title">Aegis</h1>
                    <p class="subtitle">Security Suite</p>
                </div>

                <div class="threat-level-indicator">
                    <div class="threat-badge">
                        <span class="threat-label">Risk Level</span>
                        <span class="threat-value" id="threatLevel">Minimal</span>
                    </div>
                </div>

                <div class="system-status">
                    <div class="status-indicator active">
                        <div class="status-dot"></div>
                    </div>
                    <div class="status-text">
                        <span>System</span>
                        <span>Monitoring</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 状态卡片 -->
        <div class="status-grid">
            <div class="status-card status-blocked">
                <div class="status-number" id="blockedCount">0</div>
                <div class="status-label">已拦截</div>
            </div>
            <div class="status-card status-allowed">
                <div class="status-number" id="allowedCount">0</div>
                <div class="status-label">已允许</div>
            </div>
            <div class="status-card status-warning">
                <div class="status-number" id="warningCount">0</div>
                <div class="status-label">警告</div>
            </div>
            <div class="status-card">
                <div class="status-number" id="totalCount">0</div>
                <div class="status-label">总计</div>
            </div>
        </div>

        <!-- 控制面板 -->
        <div class="controls">
            <div>
                <span style="font-weight: 600;">实时安全监控</span>
                <span style="margin-left: 12px; color: var(--text-secondary);">监控您的AI Agent命令执行</span>
            </div>
            <div style="display: flex; gap: 12px;">
                <button class="btn btn-secondary" onclick="clearEvents()">清空日志</button>
                <button class="btn" onclick="exportLogs()">导出日志</button>
            </div>
        </div>

        <!-- 事件列表 -->
        <div class="events-section">
            <div class="section-header">
                <div class="section-title">安全事件</div>
                <div style="color: var(--text-secondary); font-size: 0.875rem;">
                    实时更新 · <span id="eventCount">0</span> 个事件
                </div>
            </div>
            <div class="events-list" id="eventsList">
                <div class="empty-state" id="emptyState">
                    <div class="empty-state-icon">🛡️</div>
                    <div>等待安全事件...</div>
                    <div style="font-size: 0.875rem; margin-top: 8px; opacity: 0.7;">
                        Aegis 正在监控您的AI Agent，危险命令将被拦截并显示在这里
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let eventSource;
        let events = [];
        let stats = { blocked: 0, allowed: 0, warning: 0, info: 0, total: 0 };

        // 初始化
        document.addEventListener('DOMContentLoaded', function() {
            initializeEventSource();
            updateStats();
        });

        // 初始化事件源
        function initializeEventSource() {
            eventSource = new EventSource('/events');

            eventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);

                switch(data.type) {
                    case 'event':
                        addEventToList(data.data);
                        updateStats();
                        break;
                    case 'init':
                        stats = data.stats || stats;
                        events = data.events || [];
                        events.forEach(event => addEventToList(event, false));
                        updateStats();
                        break;
                    case 'decision_request':
                        showDecisionDialog(data.data);
                        break;
                }
            };

            eventSource.onerror = function() {
                console.log('EventSource连接错误，3秒后重连...');
                setTimeout(() => {
                    if (eventSource.readyState === EventSource.CLOSED) {
                        initializeEventSource();
                    }
                }, 3000);
            };
        }

        // HTML转义函数 - 防止XSS攻击
        function escapeHtml(text) {
            if (typeof text !== 'string') return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 添加事件到列表 (XSS安全版本)
        function addEventToList(event, animate = true) {
            const eventsList = document.getElementById('eventsList');
            const emptyState = document.getElementById('emptyState');

            if (emptyState) {
                emptyState.remove();
            }

            const eventItem = document.createElement('div');
            eventItem.className = \`event-item\${animate ? ' animate' : ''}\`;

            // ✅ 安全修复: 使用escapeHtml防止XSS
            eventItem.innerHTML = \`
                <div class="event-indicator \${escapeHtml(event.type)}"></div>
                <div class="event-content">
                    <div class="event-message">\${escapeHtml(event.message)}</div>
                    \${event.command ? \`<div class="event-command">\${escapeHtml(event.command)}</div>\` : ''}
                    <div class="event-meta">Agent: \${escapeHtml(event.agent)}</div>
                </div>
                <div class="event-time">\${escapeHtml(formatTime(event.timestamp))}</div>
            \`;

            eventsList.insertBefore(eventItem, eventsList.firstChild);

            // 限制显示的事件数量
            const items = eventsList.querySelectorAll('.event-item');
            if (items.length > 100) {
                items[items.length - 1].remove();
            }

            // 更新事件计数
            document.getElementById('eventCount').textContent = eventsList.querySelectorAll('.event-item').length;
        }

        // 更新统计
        function updateStats() {
            document.getElementById('blockedCount').textContent = stats.blocked || 0;
            document.getElementById('allowedCount').textContent = stats.allowed || 0;
            document.getElementById('warningCount').textContent = stats.warning || 0;
            document.getElementById('totalCount').textContent = stats.total || 0;
        }

        // 格式化时间
        function formatTime(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('zh-CN', { hour12: false });
        }

        // 清空事件
        function clearEvents() {
            if (confirm('确定要清空所有事件日志吗？')) {
                document.getElementById('eventsList').innerHTML = \`
                    <div class="empty-state" id="emptyState">
                        <div class="empty-state-icon">🛡️</div>
                        <div>等待安全事件...</div>
                        <div style="font-size: 0.875rem; margin-top: 8px; opacity: 0.7;">
                            Aegis 正在监控您的AI Agent，危险命令将被拦截并显示在这里
                        </div>
                    </div>
                \`;
                document.getElementById('eventCount').textContent = '0';
                fetch('/clear-events', { method: 'POST' });
            }
        }

        // 导出日志
        function exportLogs() {
            const events = Array.from(document.querySelectorAll('.event-item')).map(item => {
                const message = item.querySelector('.event-message').textContent;
                const command = item.querySelector('.event-command')?.textContent || '';
                const time = item.querySelector('.event-time').textContent;
                const agent = item.querySelector('.event-meta').textContent;
                return \`[\${time}] \${message} \${command} (\${agent})\`;
            });

            const blob = new Blob([events.join('\\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`aegis-logs-\${new Date().toISOString().split('T')[0]}.txt\`;
            a.click();
            URL.revokeObjectURL(url);
        }

        // 显示人工决策对话框
        function showDecisionDialog(request) {
            // 移除现有的决策对话框
            const existing = document.querySelector('.decision-dialog');
            if (existing) existing.remove();

            const dialog = document.createElement('div');
            dialog.className = 'decision-dialog';
            // 生成AST分析内容 (XSS安全版本)
            let astDetails = '';
            if (request.ast && request.assessment) {
                const { ast, context, assessment } = request;
                astDetails = \`
                    <div class="ast-analysis">
                        <h4>🔍 AST语义分析</h4>
                        <div class="ast-info">
                            <div><strong>程序:</strong> \${escapeHtml(ast.binary)}\${ast.subcommand ? \` \${escapeHtml(ast.subcommand)}\` : ''}</div>
                            \${ast.flags.length > 0 ? \`<div><strong>选项:</strong> \${escapeHtml(ast.flags.map(f => '--' + f).join(' '))}</div>\` : ''}
                            \${ast.arguments.length > 0 ? \`<div><strong>参数:</strong> \${escapeHtml(ast.arguments.join(' '))}</div>\` : ''}
                        </div>
                        <div class="context-info">
                            <h5>📋 执行上下文</h5>
                            \${context.isGitRepo ? \`<div>• Git仓库: \${escapeHtml(context.gitBranch)}\${context.isMainBranch ? ' (主分支)' : ''}</div>\` : ''}
                            \${context.hasUncommittedChanges ? \`<div>• ⚠️ 有未提交更改</div>\` : ''}
                            \${context.isProduction ? \`<div>• 🔴 生产环境</div>\` : ''}
                            \${context.hasRoot ? \`<div>• 👑 Root权限</div>\` : ''}
                        </div>
                        <div class="risk-details">
                            <h5>⚠️ 风险评估 (\${escapeHtml(String(assessment.score))}/100)</h5>
                            \${assessment.reasoning.map(r => \`<div>• \${escapeHtml(r)}</div>\`).join('')}
                        </div>
                    </div>
                \`;
            }

            // 🔥 生成Claude上下文分析内容
            let claudeContextDetails = '';
            if (request.claudeContext) {
                const { claudeContext } = request;
                claudeContextDetails = \`
                    <div class="claude-context">
                        <h4>🤖 Claude Code 上下文分析</h4>
                        <div class="agent-info">
                            <div><strong>当前AI模型:</strong> \${escapeHtml(claudeContext.modelInfo.icon)} \${escapeHtml(claudeContext.modelInfo.name)} (\${escapeHtml(claudeContext.modelInfo.type)})</div>
                            <div><strong>提供商:</strong> \${escapeHtml(claudeContext.modelInfo.provider)}</div>
                            \${claudeContext.modelContext ? \`<div><strong>当前任务:</strong> \${escapeHtml(claudeContext.modelContext.currentTask)}</div>\` : ''}
                            \${claudeContext.modelContext ? \`<div><strong>使用模型:</strong> \${escapeHtml(claudeContext.modelContext.model)}</div>\` : ''}
                        </div>

                        \${claudeContext.session ? \`
                        <div class="session-info">
                            <h5>📋 会话上下文</h5>
                            <div>• 会话ID: \${escapeHtml(claudeContext.session.sessionId.substr(0, 8))}...</div>
                            <div>• 项目路径: \${escapeHtml(claudeContext.session.project || 'Unknown')}</div>
                            <div>• 最后活动: \${escapeHtml(new Date(claudeContext.session.lastActivity).toLocaleString())}</div>
                        </div>
                        \` : ''}

                        \${claudeContext.userInputs.length > 0 ? \`
                        <div class="user-inputs">
                            <h5>💬 用户输入历史 (最近5条)</h5>
                            \${claudeContext.userInputs.slice(-3).map(input => \`
                                <div class="user-input">
                                    <div class="input-text">\${escapeHtml(input.text.length > 100 ? input.text.substr(0, 100) + '...' : input.text)}</div>
                                    <div class="input-time">\${escapeHtml(new Date(input.timestamp).toLocaleString())}</div>
                                </div>
                            \`).join('')}
                        </div>
                        \` : ''}

                        <div class="intent-analysis">
                            <h5>🎯 命令意图分析</h5>
                            <div>\${escapeHtml(claudeContext.commandIntent)}</div>
                        </div>

                        <div class="team-status">
                            <h5>👥 团队Agent状态</h5>
                            \${claudeContext.allAgents.map(agent => \`
                                <div class="agent-status \${agent.isActive ? 'active' : 'inactive'}">
                                    \${escapeHtml(agent.icon)} \${escapeHtml(agent.name)} -
                                    \${agent.isActive ? '🟢 活跃' : '⚫ 待机'}
                                    (\${escapeHtml(agent.currentTask)})
                                </div>
                            \`).join('')}
                        </div>

                        <div class="stats-summary">
                            <h5>📊 统计信息</h5>
                            <div>• 活跃AI模型: \${escapeHtml(claudeContext.stats.activeAIModel)}</div>
                            <div>• 总Agent数: \${claudeContext.stats.totalAgents}</div>
                            <div>• 最近输入数: \${claudeContext.stats.recentInputCount}</div>
                            <div>• 上下文状态: \${claudeContext.stats.hasContext ? '✅ 有效' : '❌ 无效'}</div>
                        </div>
                    </div>
                \`;
            }

            // ✅ 安全修复: 使用escapeHtml防止XSS
            dialog.innerHTML = \`
                <div class="decision-overlay">
                    <div class="decision-modal">
                        <div class="decision-header">
                            <h3>🚨 危险命令检测</h3>
                            <div class="risk-badge risk-\${escapeHtml(request.risk.toLowerCase())}">\${escapeHtml(request.risk)}</div>
                        </div>
                        <div class="decision-content">
                            <p><strong>Agent:</strong> \${escapeHtml(request.agent)}</p>
                            <p><strong>命令:</strong></p>
                            <code class="command-preview">\${escapeHtml(request.command)}</code>
                            \${astDetails}
                            \${claudeContextDetails}
                            <p class="decision-question">是否允许执行此命令？</p>
                        </div>
                        <div class="decision-actions">
                            <button class="btn-deny" onclick="makeDecision('\${escapeHtml(request.requestId)}', 'deny')">🛡️ 拒绝执行</button>
                            <button class="btn-allow" onclick="makeDecision('\${escapeHtml(request.requestId)}', 'allow')">✅ 允许执行</button>
                        </div>
                    </div>
                </div>
            \`;

            // 添加决策对话框样式
            if (!document.querySelector('#decision-styles')) {
                const styles = document.createElement('style');
                styles.id = 'decision-styles';
                styles.textContent = \`
                    .decision-dialog {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        z-index: 1000;
                        animation: fadeIn 0.2s ease;
                    }

                    .decision-overlay {
                        background: rgba(0, 0, 0, 0.8);
                        width: 100%;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }

                    .decision-modal {
                        background: var(--bg);
                        border-radius: 12px;
                        max-width: 500px;
                        width: 100%;
                        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                        animation: slideIn 0.3s ease;
                    }

                    .decision-header {
                        padding: 24px 24px 0;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .decision-header h3 {
                        margin: 0;
                        color: var(--danger);
                    }

                    .risk-badge {
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 0.75rem;
                        font-weight: 600;
                        text-transform: uppercase;
                    }

                    .risk-critical { background: var(--danger); color: white; }
                    .risk-high { background: #ff6b35; color: white; }
                    .risk-medium { background: var(--warning); color: white; }
                    .risk-low { background: var(--accent); color: white; }

                    .decision-content {
                        padding: 16px 24px;
                    }

                    .decision-content p {
                        margin: 12px 0;
                    }

                    .command-preview {
                        display: block;
                        background: var(--bg-secondary);
                        padding: 12px;
                        border-radius: 6px;
                        font-family: 'JetBrains Mono', monospace;
                        font-size: 0.9rem;
                        margin: 12px 0;
                        word-break: break-all;
                        border-left: 4px solid var(--danger);
                    }

                    .decision-question {
                        font-weight: 600;
                        margin-top: 20px !important;
                    }

                    .decision-actions {
                        padding: 0 24px 24px;
                        display: flex;
                        gap: 12px;
                        justify-content: flex-end;
                    }

                    .btn-deny, .btn-allow {
                        padding: 12px 24px;
                        border: none;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    }

                    .btn-deny {
                        background: var(--danger);
                        color: white;
                    }

                    .btn-deny:hover {
                        background: #dc2626;
                        transform: translateY(-1px);
                    }

                    .btn-allow {
                        background: var(--success);
                        color: white;
                    }

                    .btn-allow:hover {
                        background: #059669;
                        transform: translateY(-1px);
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }

                    .ast-analysis {
                        margin: 20px 0;
                        padding: 16px;
                        background: var(--bg-secondary);
                        border-radius: 8px;
                        border-left: 4px solid var(--accent);
                    }

                    .ast-analysis h4 {
                        margin-bottom: 12px;
                        color: var(--text);
                        font-size: 1rem;
                        font-weight: 600;
                    }

                    .ast-analysis h5 {
                        margin: 16px 0 8px 0;
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                        font-weight: 500;
                    }

                    .ast-info div,
                    .context-info div,
                    .risk-details div {
                        margin: 4px 0;
                        font-size: 0.875rem;
                        color: var(--text-secondary);
                        font-family: 'JetBrains Mono', monospace;
                    }

                    .context-info div {
                        padding-left: 8px;
                    }

                    .risk-details div {
                        padding-left: 12px;
                        border-left: 2px solid var(--warning);
                        margin-left: 4px;
                    }

                    /* 🔥 Claude Context 上下文样式 */
                    .claude-context {
                        margin: 20px 0;
                        padding: 16px;
                        background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(0, 255, 65, 0.05) 100%);
                        border-radius: 8px;
                        border: 1px solid var(--color-primary);
                        box-shadow: 0 0 15px rgba(0, 255, 65, 0.3);
                    }

                    .claude-context h4 {
                        margin-bottom: 12px;
                        color: var(--color-primary);
                        font-size: 1rem;
                        font-weight: 600;
                        text-shadow: 0 0 5px var(--color-primary);
                    }

                    .claude-context h5 {
                        margin: 16px 0 8px 0;
                        color: var(--color-foreground);
                        font-size: 0.875rem;
                        font-weight: 500;
                        border-bottom: 1px solid var(--color-primary);
                        padding-bottom: 4px;
                    }

                    .agent-info div,
                    .session-info div,
                    .intent-analysis div,
                    .stats-summary div {
                        margin: 4px 0;
                        font-size: 0.875rem;
                        color: var(--color-foreground);
                        font-family: 'Fira Code', monospace;
                        padding-left: 8px;
                    }

                    .user-inputs {
                        max-height: 120px;
                        overflow-y: auto;
                        border: 1px solid rgba(0, 255, 65, 0.3);
                        border-radius: 4px;
                        padding: 8px;
                        margin: 8px 0;
                    }

                    .user-input {
                        margin-bottom: 8px;
                        padding: 6px;
                        background: rgba(0, 255, 65, 0.1);
                        border-radius: 4px;
                        border-left: 2px solid var(--color-primary);
                    }

                    .input-text {
                        font-family: 'Fira Code', monospace;
                        font-size: 0.8rem;
                        color: var(--color-foreground);
                        margin-bottom: 4px;
                    }

                    .input-time {
                        font-size: 0.7rem;
                        color: var(--color-primary);
                        opacity: 0.8;
                    }

                    .agent-status {
                        display: flex;
                        align-items: center;
                        padding: 4px 8px;
                        margin: 4px 0;
                        border-radius: 4px;
                        font-family: 'Fira Code', monospace;
                        font-size: 0.8rem;
                    }

                    .agent-status.active {
                        background: rgba(0, 255, 65, 0.2);
                        border-left: 3px solid var(--color-primary);
                    }

                    .agent-status.inactive {
                        background: rgba(128, 128, 128, 0.1);
                        border-left: 3px solid #666;
                        opacity: 0.7;
                    }

                    @keyframes slideIn {
                        from {
                            opacity: 0;
                            transform: translateY(-20px) scale(0.95);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0) scale(1);
                        }
                    }
                \`;
                document.head.appendChild(styles);
            }

            document.body.appendChild(dialog);
        }

        // 做出决策
        function makeDecision(requestId, decision) {
            fetch('/decision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, decision })
            })
            .then(response => response.json())
            .then(data => {
                const dialog = document.querySelector('.decision-dialog');
                if (dialog) dialog.remove();
            })
            .catch(error => {
                console.error('决策提交失败:', error);
                alert('决策提交失败，请重试');
            });
        }

        // 全局函数
        window.makeDecision = makeDecision;

        // 页面卸载时关闭连接
        window.addEventListener('beforeunload', function() {
            if (eventSource) {
                eventSource.close();
            }
        });
    </script>
</body>
</html>
`;
}

// 生成暗夜线条简约风格HTML
function getDarkMinimalHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AEGIS Security Monitor - Dark Minimal Edition</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            /* 暗夜线条简约配色 */
            --bg-primary: #0F172A;
            --bg-card: rgba(255, 255, 255, 0.02);
            --accent-green: #22C55E;
            --text-primary: #FFFFFF;
            --text-secondary: rgba(255, 255, 255, 0.7);
            --border: rgba(255, 255, 255, 0.08);
            --border-accent: rgba(34, 197, 94, 0.3);
            --danger: #DC2626;
            --warning: #F59E0B;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'JetBrains Mono', monospace;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding: 2rem;
        }

        /* 主标题 - 极简线条风格 */
        .header {
            margin-bottom: 3rem;
            padding-bottom: 1.5rem;
            border-bottom: 1px solid var(--border);
            position: relative;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .header-main {
            flex: 1;
        }

        .header-controls {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        /* 语言切换 */
        .lang-toggle {
            display: flex;
            border: 1px solid var(--border);
            overflow: hidden;
        }

        .lang-btn {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            padding: 0.5rem 1rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.75rem;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            border-right: 1px solid var(--border);
        }

        .lang-btn:last-child {
            border-right: none;
        }

        .lang-btn.active {
            background: var(--accent-green);
            color: var(--bg-primary);
        }

        .lang-btn:not(.active):hover {
            background: rgba(34, 197, 94, 0.1);
            color: var(--accent-green);
        }

        .title {
            font-family: 'Orbitron', monospace;
            font-size: 2.5rem;
            font-weight: 900;
            color: var(--text-primary);
            letter-spacing: 0.1em;
            margin-bottom: 0.5rem;
        }

        .title::before {
            content: '>';
            color: var(--accent-green);
            margin-right: 0.5rem;
            animation: cursor-pulse 2s ease-in-out infinite;
        }

        @keyframes cursor-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .subtitle {
            font-size: 0.875rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.2em;
            position: relative;
            padding-left: 1rem;
        }

        .subtitle::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            width: 0.5rem;
            height: 1px;
            background: var(--accent-green);
            transform: translateY(-50%);
        }

        /* Agent信息面板 */
        .agent-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 1.5rem;
            margin-bottom: 2rem;
        }

        .agent-panel, .input-panel, .intent-panel {
            background: var(--bg-card);
            border: 1px solid var(--border);
            overflow: hidden;
        }

        .panel-header {
            background: rgba(34, 197, 94, 0.05);
            border-bottom: 1px solid var(--border);
            padding: 0.75rem 1rem;
            font-family: 'Orbitron', monospace;
            font-size: 0.75rem;
            font-weight: 700;
            color: var(--accent-green);
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }

        .agent-info, .intent-info {
            padding: 1rem;
        }

        .agent-type {
            font-size: 1rem;
            color: var(--accent-green);
            margin-bottom: 0.5rem;
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
        }

        .agent-status, .agent-model, .agent-tokens {
            font-size: 0.8rem;
            color: var(--text-secondary);
            margin-bottom: 0.3rem;
        }

        .agent-tokens {
            color: var(--accent-green);
        }

        .input-history {
            padding: 1rem;
            max-height: 200px;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: var(--accent-green) transparent;
        }

        .input-history::-webkit-scrollbar {
            width: 4px;
        }

        .input-history::-webkit-scrollbar-track {
            background: transparent;
        }

        .input-history::-webkit-scrollbar-thumb {
            background: var(--accent-green);
            border-radius: 0;
        }

        .input-item {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 0.5rem;
            padding: 0.5rem;
            border-left: 1px solid transparent;
            transition: all 0.2s ease;
        }

        .input-item.recent {
            border-left-color: var(--accent-green);
            background: rgba(34, 197, 94, 0.05);
        }

        .input-time {
            color: var(--accent-green);
            font-size: 0.7rem;
            min-width: 2rem;
        }

        .input-text {
            color: var(--text-secondary);
            font-size: 0.8rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .intent-primary {
            color: var(--accent-green);
            font-weight: 600;
            margin-bottom: 0.5rem;
        }

        .intent-sub {
            color: var(--text-secondary);
            font-size: 0.8rem;
            margin-bottom: 0.3rem;
            padding-left: 0.5rem;
        }

        .confidence {
            margin-top: 0.75rem;
            color: var(--accent-green);
            font-size: 0.75rem;
            font-weight: 600;
        }

        /* 状态网格 - 线条卡片 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }

        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            padding: 1.5rem;
            transition: all 0.3s ease;
            position: relative;
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 1px;
            background: var(--accent-green);
            transform: scaleX(0);
            transform-origin: left;
            transition: transform 0.3s ease;
        }

        .stat-card:hover::before {
            transform: scaleX(1);
        }

        .stat-card:hover {
            border-color: var(--border-accent);
            background: rgba(34, 197, 94, 0.02);
        }

        .stat-number {
            font-family: 'Orbitron', monospace;
            font-size: 2rem;
            font-weight: 700;
            color: var(--accent-green);
            margin-bottom: 0.5rem;
            line-height: 1;
        }

        .stat-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-secondary);
            position: relative;
            padding-left: 0.75rem;
        }

        .stat-label::before {
            content: '—';
            position: absolute;
            left: 0;
            color: var(--accent-green);
        }

        /* 事件列表 - 超简约风格 */
        .events-section {
            border: 1px solid var(--border);
            background: var(--bg-card);
        }

        .events-header {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border);
            font-family: 'Orbitron', monospace;
            font-size: 0.875rem;
            font-weight: 700;
            color: var(--accent-green);
            text-transform: uppercase;
            letter-spacing: 0.15em;
        }

        .event-item-detailed {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border);
            display: grid;
            grid-template-columns: auto 1fr auto;
            gap: 1rem;
            align-items: start;
            transition: background 0.2s ease;
        }

        .event-item-detailed:hover {
            background: rgba(255, 255, 255, 0.02);
        }

        .event-item-detailed:last-child {
            border-bottom: none;
        }

        .event-status {
            width: 8px;
            height: 8px;
            background: var(--accent-green);
            flex-shrink: 0;
            margin-top: 6px;
        }

        .event-status.critical {
            background: var(--danger);
            box-shadow: 0 0 8px rgba(220, 38, 38, 0.5);
        }

        .event-status.warning {
            background: var(--warning);
        }

        .event-main {
            min-width: 0;
        }

        .event-command {
            font-family: 'JetBrains Mono', monospace;
            color: var(--text-primary);
            font-weight: 600;
            margin-bottom: 0.5rem;
            font-size: 0.9rem;
        }

        .event-context {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
        }

        .context-tag {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border);
            padding: 0.2rem 0.5rem;
            font-size: 0.7rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .context-tag:first-child {
            color: var(--accent-green);
            border-color: var(--border-accent);
        }

        .event-intent {
            font-size: 0.8rem;
            color: var(--text-secondary);
            font-style: italic;
        }

        .event-meta {
            text-align: right;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            align-items: flex-end;
        }

        .event-time {
            font-size: 0.75rem;
            color: var(--text-secondary);
            font-family: 'JetBrains Mono', monospace;
        }

        .event-action {
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            padding: 0.25rem 0.5rem;
            border: 1px solid;
            color: var(--accent-green);
            border-color: var(--accent-green);
            background: rgba(34, 197, 94, 0.1);
        }

        .event-item-detailed:has(.event-status.critical) .event-action {
            color: var(--danger);
            border-color: var(--danger);
            background: rgba(220, 38, 38, 0.1);
        }

        .event-item-detailed:has(.event-status.warning) .event-action {
            color: var(--warning);
            border-color: var(--warning);
            background: rgba(245, 158, 11, 0.1);
        }

        /* 控制按钮 - 线条风格 */
        .controls {
            margin-top: 2rem;
            display: flex;
            gap: 1rem;
        }

        .btn {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text-primary);
            padding: 0.75rem 1.5rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.875rem;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            position: relative;
            overflow: hidden;
        }

        .btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(34, 197, 94, 0.1), transparent);
            transition: left 0.5s ease;
        }

        .btn:hover::before {
            left: 100%;
        }

        .btn:hover {
            border-color: var(--accent-green);
            color: var(--accent-green);
        }

        .btn-danger:hover {
            border-color: var(--danger);
            color: var(--danger);
        }

        /* 状态指示器 */
        .status-bar {
            position: fixed;
            bottom: 1rem;
            right: 1rem;
            background: var(--bg-card);
            border: 1px solid var(--border);
            padding: 0.5rem 1rem;
            font-size: 0.75rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .status-dot {
            width: 6px;
            height: 6px;
            background: var(--accent-green);
            animation: status-pulse 2s ease-in-out infinite;
        }

        @keyframes status-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        /* 响应式 */
        @media (max-width: 1024px) {
            .agent-grid {
                grid-template-columns: 1fr 1fr;
                gap: 1rem;
            }
            .intent-panel {
                grid-column: 1 / -1;
            }
        }

        @media (max-width: 768px) {
            .agent-grid {
                grid-template-columns: 1fr;
                gap: 1rem;
            }
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 1rem;
            }
            .title {
                font-size: 2rem;
            }
            .controls {
                flex-direction: column;
            }
            .event-item-detailed {
                grid-template-columns: 1fr;
                gap: 0.75rem;
            }
            .event-meta {
                align-items: flex-start;
                text-align: left;
            }
            .context-tag {
                font-size: 0.6rem;
            }
        }
    </style>
</head>
<body>
    <!-- 主标题区域 -->
    <div class="header">
        <div class="header-main">
            <h1 class="title">AEGIS</h1>
            <p class="subtitle" data-zh="安全监控 - 暗夜简约版" data-en="Security Monitor - Dark Minimal Edition">Security Monitor - Dark Minimal Edition</p>
        </div>
        <div class="header-controls">
            <div class="lang-toggle">
                <button class="lang-btn active" data-lang="en">EN</button>
                <button class="lang-btn" data-lang="zh">中文</button>
            </div>
        </div>
    </div>

    <!-- Agent状态面板 -->
    <div class="agent-grid">
        <!-- 当前活跃Agent -->
        <div class="agent-panel">
            <div class="panel-header" data-zh="[ 活跃模型 ]" data-en="[ Active AI Model ]">[ Active AI Model ]</div>
            <div class="agent-info">
                <div class="agent-type" id="currentAgent">🤖 Claude</div>
                <div class="agent-status" id="agentStatus" data-zh="等待连接..." data-en="Waiting for connection...">Waiting for connection...</div>
                <div class="agent-model" id="agentModel" data-zh="模型: 未知" data-en="Model: Unknown">Model: Unknown</div>
                <div class="agent-tokens" id="agentTokens" data-zh="令牌: 0 / 10,000" data-en="Tokens: 0 / 10,000">Tokens: 0 / 10,000</div>
            </div>
        </div>

        <!-- 用户输入历史 -->
        <div class="input-panel">
            <div class="panel-header" data-zh="[ 用户输入上下文 ]" data-en="[ User Input Context ]">[ User Input Context ]</div>
            <div class="input-history" id="userInputHistory">
                <div class="input-item">
                    <span class="input-time">--:--</span>
                    <span class="input-text">等待用户输入...</span>
                </div>
            </div>
        </div>

        <!-- Agent意图分析 -->
        <div class="intent-panel">
            <div class="panel-header" data-zh="[ 模型意图 ]" data-en="[ AI Intent ]">[ AI Intent ]</div>
            <div class="intent-info">
                <div class="intent-primary" id="primaryIntent" data-zh="🤖 等待分析..." data-en="🤖 Waiting for analysis...">🤖 Waiting for analysis...</div>
                <div id="intentDetails">
                    <div class="intent-sub" data-zh="• 连接监控系统" data-en="• Connect to monitoring system">• Connect to monitoring system</div>
                    <div class="intent-sub" data-zh="• 准备命令拦截" data-en="• Prepare command interception">• Prepare command interception</div>
                </div>
                <div class="confidence" id="intentConfidence" data-zh="置信度: --%" data-en="Confidence: --%" >Confidence: --%</div>
            </div>
        </div>
    </div>

    <!-- 状态统计卡片 -->
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-number" id="blockedCount">0</div>
            <div class="stat-label" data-zh="已拦截命令" data-en="Commands Blocked">Commands Blocked</div>
        </div>

        <div class="stat-card">
            <div class="stat-number" id="allowedCount">0</div>
            <div class="stat-label" data-zh="已允许命令" data-en="Commands Allowed">Commands Allowed</div>
        </div>

        <div class="stat-card">
            <div class="stat-number" id="warningCount">0</div>
            <div class="stat-label" data-zh="安全警告" data-en="Security Warnings">Security Warnings</div>
        </div>

        <div class="stat-card">
            <div class="stat-number" id="activeConnections">0</div>
            <div class="stat-label" data-zh="活跃会话" data-en="Active Sessions">Active Sessions</div>
        </div>
    </div>

    <!-- 详细事件列表 -->
    <div class="events-section">
        <div class="events-header" data-zh="[ 安全事件与AI上下文 ]" data-en="[ Security Events & AI Context ]">
            [ Security Events & AI Context ]
        </div>
        <div id="eventsList">
            <!-- 动态事件将在这里显示 -->
        </div>
    </div>

    <!-- 控制按钮 -->
    <div class="controls">
        <button class="btn" onclick="refreshData()" data-zh="刷新" data-en="Refresh">Refresh</button>
        <button class="btn btn-danger" onclick="clearEvents()" data-zh="清除日志" data-en="Clear Log">Clear Log</button>
        <button class="btn" onclick="exportData()" data-zh="导出" data-en="Export">Export</button>
    </div>

    <!-- 状态指示器 -->
    <div class="status-bar">
        <div class="status-dot"></div>
        <span id="monitorStatus" data-zh="监控激活" data-en="MONITORING ACTIVE">MONITORING ACTIVE</span>
    </div>

    <script>
        // 全局变量
        let currentLang = 'en';
        let eventSource = null;
        let stats = { blocked: 0, allowed: 0, warning: 0, info: 0 };

        // 语言切换功能
        const langButtons = document.querySelectorAll('.lang-btn');
        const elementsWithLang = document.querySelectorAll('[data-zh][data-en]');

        function switchLanguage(lang) {
            currentLang = lang;
            // 更新按钮状态
            langButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.lang === lang);
            });

            // 更新所有文本内容
            elementsWithLang.forEach(element => {
                if (lang === 'zh') {
                    element.textContent = element.getAttribute('data-zh');
                } else {
                    element.textContent = element.getAttribute('data-en');
                }
            });

            // 存储语言偏好
            localStorage.setItem('preferredLanguage', lang);
        }

        // 添加点击事件
        langButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                switchLanguage(btn.dataset.lang);
            });
        });

        // 页面加载时恢复语言设置
        document.addEventListener('DOMContentLoaded', () => {
            const savedLang = localStorage.getItem('preferredLanguage') || 'en';
            switchLanguage(savedLang);
            initializeEventSource();
        });

        // 初始化事件源
        function initializeEventSource() {
            if (eventSource) {
                eventSource.close();
            }

            eventSource = new EventSource('/events');

            eventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);

                switch(data.type) {
                    case 'init':
                        updateStats(data.stats);
                        displayEvents(data.events);
                        break;
                    case 'event':
                        addEventToDisplay(data.data);
                        updateStatsFromEvent(data.data);
                        break;
                    case 'decision_request':
                        showDecisionDialog(data.data);
                        break;
                }
            };

            eventSource.onerror = function() {
                console.log('EventSource连接错误，3秒后重连...');
                setTimeout(() => {
                    if (eventSource.readyState === EventSource.CLOSED) {
                        initializeEventSource();
                    }
                }, 3000);
            };
        }

        // 更新统计数据
        function updateStats(newStats) {
            stats = newStats;
            document.getElementById('blockedCount').textContent = stats.blocked || 0;
            document.getElementById('allowedCount').textContent = stats.allowed || 0;
            document.getElementById('warningCount').textContent = stats.warning || 0;
            document.getElementById('activeConnections').textContent = stats.total || 0;
        }

        // 从事件更新统计
        function updateStatsFromEvent(event) {
            if (event.type === 'blocked') stats.blocked++;
            if (event.type === 'allowed') stats.allowed++;
            if (event.type === 'warning') stats.warning++;
            stats.total++;
            updateStats(stats);
        }

        // 显示事件列表
        function displayEvents(events) {
            const eventsList = document.getElementById('eventsList');
            eventsList.innerHTML = '';

            if (events && events.length > 0) {
                events.forEach(event => addEventToDisplay(event, false));
            } else {
                eventsList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No events yet...</div>';
            }
        }

        // 添加单个事件到显示
        function addEventToDisplay(event, animate = true) {
            const eventsList = document.getElementById('eventsList');

            // 移除空状态消息
            if (eventsList.children.length === 1 && eventsList.firstElementChild.style.textAlign === 'center') {
                eventsList.innerHTML = '';
            }

            const eventDiv = document.createElement('div');
            eventDiv.className = 'event-item-detailed';

            let statusClass = '';
            let actionText = 'INFO';
            let actionColor = 'var(--accent-green)';

            if (event.type === 'blocked') {
                statusClass = 'critical';
                actionText = 'BLOCKED';
                actionColor = 'var(--danger)';
            } else if (event.type === 'warning') {
                statusClass = 'warning';
                actionText = 'WARNING';
                actionColor = 'var(--warning)';
            } else if (event.type === 'allowed') {
                actionText = 'ALLOWED';
            }

            const timestamp = new Date(event.timestamp);
            const timeStr = timestamp.toLocaleTimeString();

            eventDiv.innerHTML = \`
                <div class="event-status \${statusClass}"></div>
                <div class="event-main">
                    <div class="event-command">\${escapeHtml(event.command || event.message)}</div>
                    <div class="event-context">
                        <span class="context-tag">\${currentLang === 'zh' ? 'AI模型' : 'AI Model'}: \${escapeHtml(event.agent)}</span>
                        <span class="context-tag">\${currentLang === 'zh' ? '类型' : 'Type'}: \${escapeHtml(event.type.toUpperCase())}</span>
                        <span class="context-tag">\${currentLang === 'zh' ? '时间' : 'Time'}: \${timeStr}</span>
                    </div>
                    <div class="event-intent">\${currentLang === 'zh' ? '意图' : 'Intent'}: \${escapeHtml(event.message || 'System event')}</div>
                </div>
                <div class="event-meta">
                    <div class="event-time">\${timeStr}</div>
                    <div class="event-action" style="color: \${actionColor}; border-color: \${actionColor}">\${actionText}</div>
                </div>
            \`;

            if (animate) {
                eventDiv.style.opacity = '0';
                eventDiv.style.transform = 'translateY(-10px)';
                eventsList.insertBefore(eventDiv, eventsList.firstChild);

                setTimeout(() => {
                    eventDiv.style.transition = 'all 0.3s ease';
                    eventDiv.style.opacity = '1';
                    eventDiv.style.transform = 'translateY(0)';
                }, 10);
            } else {
                eventsList.appendChild(eventDiv);
            }

            // 限制显示的事件数量
            while (eventsList.children.length > 50) {
                eventsList.removeChild(eventsList.lastChild);
            }
        }

        // HTML转义函数
        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 显示决策对话框
        function showDecisionDialog(request) {
            // 移除现有对话框
            const existing = document.querySelector('.decision-dialog');
            if (existing) existing.remove();

            const dialog = document.createElement('div');
            dialog.className = 'decision-dialog';

            // 生成AI上下文详情
            let aiContextDetails = '';
            if (request.claudeContext) {
                const ctx = request.claudeContext;
                aiContextDetails = \`
                    <div style="margin: 1rem 0; padding: 1rem; background: rgba(34, 197, 94, 0.05); border: 1px solid var(--border-accent);">
                        <h4 style="color: var(--accent-green); margin-bottom: 0.5rem;">🤖 AI模型上下文</h4>
                        <div style="margin-bottom: 0.5rem;"><strong>模型:</strong> \${escapeHtml(ctx.modelInfo.name)} (\${escapeHtml(ctx.modelInfo.type)})</div>
                        <div style="margin-bottom: 0.5rem;"><strong>提供商:</strong> \${escapeHtml(ctx.modelInfo.provider)}</div>
                        \${ctx.commandIntent ? \`<div style="margin-bottom: 0.5rem;"><strong>意图:</strong> \${escapeHtml(ctx.commandIntent)}</div>\` : ''}
                        \${ctx.stats ? \`<div><strong>状态:</strong> \${ctx.stats.hasContext ? '有效上下文' : '无上下文'}</div>\` : ''}
                    </div>
                \`;
            }

            dialog.innerHTML = \`
                <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 2rem;">
                    <div style="background: var(--bg-primary); border: 1px solid var(--border); max-width: 600px; width: 100%; padding: 2rem; position: relative;">
                        <h3 style="color: var(--accent-green); margin-bottom: 1rem;">🚨 命令安全检查</h3>
                        <div style="margin-bottom: 1rem;">
                            <strong>AI模型:</strong> \${escapeHtml(request.agent)}<br>
                            <strong>命令:</strong> <code style="background: rgba(255,255,255,0.1); padding: 0.25rem;">\${escapeHtml(request.command)}</code><br>
                            <strong>风险级别:</strong> <span style="color: var(--danger)">\${escapeHtml(request.risk)}</span>
                        </div>
                        \${aiContextDetails}
                        <p style="margin: 1rem 0; color: var(--text-secondary);">是否允许执行此命令？</p>
                        <div style="display: flex; gap: 1rem;">
                            <button onclick="makeDecision('\${escapeHtml(request.requestId)}', 'deny')" style="background: var(--danger); border: none; color: white; padding: 0.75rem 1.5rem; cursor: pointer;">🛡️ 拒绝</button>
                            <button onclick="makeDecision('\${escapeHtml(request.requestId)}', 'allow')" style="background: var(--accent-green); border: none; color: var(--bg-primary); padding: 0.75rem 1.5rem; cursor: pointer;">✅ 允许</button>
                        </div>
                    </div>
                </div>
            \`;

            document.body.appendChild(dialog);
        }

        // 做出决策
        function makeDecision(requestId, decision) {
            fetch('/decision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, decision, reason: 'User decision' })
            });

            const dialog = document.querySelector('.decision-dialog');
            if (dialog) dialog.remove();
        }

        // 控制按钮功能
        function refreshData() {
            location.reload();
        }

        function clearEvents() {
            if (confirm(currentLang === 'zh' ? '确定要清除所有事件日志吗？' : 'Are you sure you want to clear all event logs?')) {
                document.getElementById('eventsList').innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No events yet...</div>';
            }
        }

        function exportData() {
            const data = {
                timestamp: new Date().toISOString(),
                stats: stats,
                events: Array.from(document.querySelectorAll('.event-item-detailed')).map(el => ({
                    command: el.querySelector('.event-command').textContent,
                    timestamp: el.querySelector('.event-time').textContent,
                    action: el.querySelector('.event-action').textContent
                }))
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`aegis-security-log-\${new Date().toISOString().slice(0,10)}.json\`;
            a.click();
            URL.revokeObjectURL(url);
        }
    </script>
</body>
</html>`;
}

// HTTP请求处理
const server = http.createServer((req, res) => {
  // CORS设置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getDarkMinimalHTML());
  }
  else if (req.url === '/events') {
    // SSE连接
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    connections.push(res);

    // 发送初始数据
    res.write(`data: ${JSON.stringify({ type: 'init', stats, events: events.slice(0, 50) })}\n\n`);

    req.on('close', () => {
      connections = connections.filter(conn => conn !== res);
    });
  }
  else if (req.url === '/add-event' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const eventData = JSON.parse(body);
        // 将Hook发送的事件添加到监控界面
        addEvent(eventData.type, eventData.message, eventData.command, eventData.agent || 'Claude Code');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));

        console.log(`📡 收到Hook事件: ${eventData.type} - ${eventData.message}`);
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }
  else if (req.url === '/decision-request' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const request = JSON.parse(body);
        pendingDecisions.set(request.requestId, { request, resolve: null, res });

        // 广播决策请求给Web界面
        broadcastEvent({ type: 'decision_request', data: request });

        console.log(`⚠️ 人工审核请求: ${request.command} (${request.risk})`);
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }
  else if (req.url === '/decision' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { requestId, decision, reason } = JSON.parse(body);
        const pending = pendingDecisions.get(requestId);

        if (pending) {
          // 响应Hook请求
          pending.res.writeHead(200, { 'Content-Type': 'application/json' });
          pending.res.end(JSON.stringify({ success: true, decision }));

          pendingDecisions.delete(requestId);

          // 记录决策结果
          const eventType = decision === 'allow' ? 'allowed' : 'blocked';
          const message = decision === 'allow'
            ? `✅ 用户批准执行: ${pending.request.command}`
            : `🛡️ 用户拒绝执行: ${pending.request.command}`;

          addEvent(eventType, message, pending.request.command, pending.request.agent);

          console.log(`📋 决策完成: ${decision} - ${pending.request.command}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }
  else if (req.url === '/clear-events' && req.method === 'POST') {
    events.length = 0;
    stats = { blocked: 0, allowed: 0, warning: 0, info: 0, total: 0 };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));

    // 通知所有客户端清空
    broadcastEvent({ type: 'clear' });
  }
  else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// 启动服务器
server.listen(WEB_PORT, () => {
  console.log(`🟢 AEGIS - CYBERPUNK MATRIX EDITION`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🌐 监控界面: http://localhost:${WEB_PORT}`);
  console.log(`🎨 设计风格: Matrix Green + Neon Glow`);
  console.log(`⚡ 特性: Terminal HUD + 霓虹效果 + 实时数据流`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(``);

  // 添加欢迎事件
  addEvent('info', '🛡️ Aegis Security Monitor 已启动', '', 'System');
  addEvent('info', '⚡ 实时监控系统已激活', '', 'System');
});

// 信号处理
process.on('SIGINT', () => {
  console.log('\n\n👋 正在关闭 Aegis 监控...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});