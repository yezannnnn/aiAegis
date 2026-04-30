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
    const socket = new net.Socket();
    socket.setTimeout(TIMEOUT);

    const request = {
      type: 'approval_request',
      payload: {
        id: `claude-hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        command: command,
        cwd: process.cwd(),
        agentType: 'claude-code',
        timestamp: Date.now(),
        context: {
          environment: gatherEnvironmentContext(),
          source: 'claude-code-hook'
        }
      }
    };

    let response = '';

    socket.connect(AEGIS_PORT, AEGIS_HOST, () => {
      socket.write(JSON.stringify(request) + '\n');
    });

    socket.on('data', (data) => {
      response += data.toString();

      // 处理可能的多行响应
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const result = JSON.parse(line);
            if (result.type === 'approval_resolution') {
              socket.end();
              resolve({
                decision: result.payload.decision,
                reason: result.payload.reason
              });
              return;
            } else if (result.type === 'denied') {
              socket.end();
              resolve({
                decision: 'DENY',
                reason: result.payload.reason
              });
              return;
            }
          } catch {}
        }
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ decision: 'ALLOW', reason: 'Timeout - allowing execution' });
    });

    socket.on('error', (err) => {
      resolve({ decision: 'ALLOW', reason: `Network error - allowing execution: ${err.message}` });
    });
  });
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