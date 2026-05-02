#!/usr/bin/env node
/**
 * Aegis Claude Code PreToolUse Hook
 *
 * 拦截Claude Code的Bash命令执行，通过Aegis进行风险评估
 * Exit Code 2 = 阻止执行，Exit Code 0 = 允许执行
 */

'use strict';

const net = require('net');
const { execSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;
const AEGIS_HOST = '127.0.0.1';
const AEGIS_PORT = 9876;
const TIMEOUT = 5000;

let raw = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length < MAX_STDIN) {
    const remaining = MAX_STDIN - raw.length;
    raw += chunk.substring(0, remaining);
  }
});

process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(raw);

    // 只处理Bash命令
    if (input.tool_name !== 'Bash') {
      process.stdout.write(raw);
      return;
    }

    const command = String(input.tool_input?.command || '').trim();
    if (!command) {
      process.stdout.write(raw);
      return;
    }

    // 检查Aegis daemon是否运行
    const isDaemonRunning = await checkAegisDaemon();
    if (!isDaemonRunning) {
      // Daemon未运行，通过简化规则进行基本检查
      const isBlocked = checkBasicRules(command);
      if (isBlocked) {
        console.error(`[Aegis] BLOCKED: ${isBlocked.reason}`);
        console.error(`[Aegis] Start 'aegis monitor' for advanced protection`);
        process.exit(2);
      }
      process.stdout.write(raw);
      return;
    }

    // 向Aegis daemon发送风险评估请求
    const result = await requestAegisApproval(command);

    if (result.decision === 'DENY') {
      console.error(`[Aegis] BLOCKED: ${result.reason || 'Dangerous operation detected'}`);
      if (result.context?.detailedExplanation) {
        console.error(`[Aegis] Details: ${result.context.detailedExplanation.substring(0, 200)}...`);
      }
      console.error(`[Aegis] Open Aegis Monitor to review and approve if needed`);
      process.exit(2);
    }

    if (result.decision === 'WARN') {
      console.error(`[Aegis] WARNING: ${result.reason || 'Potentially risky operation'}`);
    }

  } catch (error) {
    // 解析或处理错误时，允许命令执行但记录错误
    console.error(`[Aegis] Hook error: ${error.message}`);
  }

  // 输出原始数据，允许执行
  process.stdout.write(raw);
});

/**
 * 检查Aegis daemon是否运行
 */
async function checkAegisDaemon() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);

    socket.connect(AEGIS_PORT, AEGIS_HOST, () => {
      socket.end();
      resolve(true);
    });

    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * 向Aegis daemon发送审批请求
 */
async function requestAegisApproval(command) {
  return new Promise((resolve) => {
    const envContext = gatherEnvironmentContext();
    const detectedIntent = analyzeCommandIntent(command, envContext);

    const requestData = {
      type: 'approval_request',
      command: command,
      cwd: process.cwd(),
      agentType: 'claude-code',
      timestamp: Date.now(),
      sessionId: envContext.sessionId || null, // 包含真实session ID
      intent: detectedIntent, // 智能识别的用户意图
      context: {
        ...envContext,
        intentAnalysis: {
          detected: detectedIntent,
          confidence: detectedIntent.includes('detected') ? 'high' : 'medium',
          analysisTime: new Date().toISOString()
        }
      },
      source: 'claude-code-hook'
    };

    const postData = JSON.stringify(requestData);

    const options = {
      hostname: AEGIS_HOST,
      port: AEGIS_PORT,
      path: '/hook-event',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: TIMEOUT
    };

    const req = require('http').request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (result.success) {
            // 监控系统记录了事件，默认允许执行（可根据需要修改策略）
            resolve({ decision: 'ALLOW', reason: 'Logged to monitoring system' });
          } else {
            resolve({ decision: 'ALLOW', reason: 'Default allow' });
          }
        } catch (error) {
          resolve({ decision: 'ALLOW', reason: 'Response parsing error' });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ decision: 'ALLOW', reason: `HTTP request failed: ${error.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ decision: 'ALLOW', reason: 'HTTP request timeout' });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 获取真实Claude Code Session ID
 */
function getClaudeSessionId() {
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    // 查找Claude sessions目录
    const sessionsDir = path.join(os.homedir(), '.claude', 'sessions');
    if (!fs.existsSync(sessionsDir)) return null;

    // 优先查找活跃的Claude Code进程session
    const sessionFiles = fs.readdirSync(sessionsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        try {
          const filePath = path.join(sessionsDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

          // 检查进程是否还在运行
          const pid = data.pid;
          let isRunning = false;
          try {
            process.kill(pid, 0); // 0信号仅检查进程存在性
            isRunning = true;
          } catch {}

          if (isRunning) {
            const stat = fs.statSync(filePath);
            return { file, data, mtime: stat.mtime, isActive: true };
          }
          return null;
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    // 返回最新的活跃session
    return sessionFiles.length > 0 ? sessionFiles[0].data.sessionId : null;
  } catch (error) {
    return null;
  }
}

/**
 * 智能分析命令意图
 */
function analyzeCommandIntent(command, context) {
  try {
    // 基于命令模式的意图识别
    const intentPatterns = {
      // 开发相关
      'development': [
        /git\s+(add|commit|push|pull|clone)/,
        /npm\s+(install|run|start|build|test)/,
        /yarn\s+(install|start|build|test)/,
        /node\s+.*\.js/,
        /python\s+.*\.py/,
        /docker\s+(build|run|start|stop)/,
      ],

      // 文件操作
      'file_management': [
        /^(cp|mv|mkdir|rmdir)\s+/,
        /^ls\s+(-[la]+\s+)?/,
        /^find\s+.*\s+-name/,
        /^cat\s+.*\.(txt|md|json|yaml)/,
      ],

      // 系统管理
      'system_admin': [
        /^sudo\s+/,
        /^chmod\s+/,
        /^chown\s+/,
        /ps\s+aux/,
        /^kill\s+-?\d+/,
      ],

      // 危险操作
      'dangerous_operation': [
        /rm\s+(-rf|--recursive.*--force)/,
        /git\s+push\s+(-f|--force)/,
        /dd\s+.*of=/,
        /^sudo\s+rm/,
      ],

      // 网络/API
      'network_request': [
        /curl\s+/,
        /wget\s+/,
        /ping\s+/,
        /ssh\s+/,
      ],

      // 监控/调试
      'monitoring_debug': [
        /tail\s+(-f\s+)?.*\.log/,
        /grep\s+.*\s+.*\.log/,
        /^ps\s+/,
        /^top$/,
        /^htop$/,
      ]
    };

    // 检查命令匹配的意图模式
    for (const [intent, patterns] of Object.entries(intentPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(command)) {
          return `${intent}_detected`;
        }
      }
    }

    // 基于上下文的意图推断
    if (context?.cwd) {
      if (context.cwd.includes('node_modules')) return 'dependency_management';
      if (context.cwd.includes('.git')) return 'version_control';
      if (context.cwd.includes('/tmp')) return 'temporary_operation';
    }

    // 基于项目类型的意图推断
    if (context?.projectType) {
      switch (context.projectType) {
        case 'node': return 'nodejs_development';
        case 'python': return 'python_development';
        case 'go': return 'go_development';
      }
    }

    return 'general_command_execution';
  } catch (error) {
    return 'intent_analysis_failed';
  }
}

/**
 * 收集环境上下文信息
 */
function gatherEnvironmentContext() {
  try {
    const context = {
      platform: process.platform,
      cwd: process.cwd(),
      user: process.env.USER || process.env.USERNAME,
      sessionId: getClaudeSessionId(), // 添加真实session ID
    };

    // 检查git状态
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
      context.git = {
        isRepo: true,
        currentBranch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
        hasUncommittedChanges: execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0
      };
    } catch {
      context.git = { isRepo: false };
    }

    // 检查项目类型
    const fs = require('fs');
    if (fs.existsSync('package.json')) context.projectType = 'node';
    else if (fs.existsSync('requirements.txt')) context.projectType = 'python';
    else if (fs.existsSync('go.mod')) context.projectType = 'go';

    return context;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * 基本规则检查（daemon未运行时的fallback）
 */
function checkBasicRules(command) {
  const dangerousPatterns = [
    { pattern: /rm\s+(-rf|--recursive.*--force)\s+\//, reason: '尝试删除根目录文件' },
    { pattern: /git\s+push\s+(-f|--force)/, reason: '强制推送可能覆盖其他人的工作' },
    { pattern: /dd\s+.*of=\/dev\//, reason: '直接写入设备文件，可能损坏系统' },
    { pattern: /chmod\s+777/, reason: '设置过度开放的文件权限' },
    { pattern: /sudo\s+rm/, reason: '使用sudo删除文件，风险较高' },
  ];

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(command)) {
      return { reason };
    }
  }

  return null;
}