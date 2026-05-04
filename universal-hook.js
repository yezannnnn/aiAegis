#!/usr/bin/env node
/**
 * Aegis Universal Hook - AST + 规则引擎集成版本
 */

const http = require('http');
const path = require('path');

const AEGIS_PORT = 3001;
const MAX_STDIN = 1024 * 1024;

// 加载规则引擎
const AegisRuleEngine = require('./rule-engine.js');

let raw = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length < MAX_STDIN) {
    raw += chunk.substring(0, MAX_STDIN - raw.length);
  }
});

process.stdin.on('end', async () => {
  try {
    // 解析Claude Code输入
    if (!raw.includes('"tool_name"')) {
      process.stdout.write(raw);
      return;
    }

    const input = JSON.parse(raw);
    if (input.tool_name !== 'Bash' || !input.tool_input?.command) {
      process.stdout.write(raw);
      return;
    }

    const command = input.tool_input.command;

    // 🔧 第一步：使用规则引擎进行本地检查
    const ruleEngine = new AegisRuleEngine();
    const ruleResult = ruleEngine.checkCommand(command);

    // 根据规则引擎结果处理
    switch (ruleResult.action) {
      case 'allow':
        // 直接允许，不发送到监控系统
        process.stdout.write(raw);
        return;

      case 'deny':
        // 直接阻止
        const deniedInput = {
          ...input,
          tool_input: {
            ...input.tool_input,
            command: `echo "🛡️ [Aegis] 命令被禁止: ${ruleResult.reason}"`
          }
        };
        process.stdout.write(JSON.stringify(deniedInput));
        return;

      case 'review':
        // 需要审批，发送到监控系统
        const result = await sendToMonitor(command, ruleResult);

        if (result.approved) {
          process.stdout.write(raw);
        } else {
          // 返回修改后的安全JSON，避免JSON验证错误
          const blockedInput = {
            ...input,
            tool_input: {
              ...input.tool_input,
              command: `echo "🛡️ [Aegis] 命令被阻止: ${result.reason}"`
            }
          };
          process.stdout.write(JSON.stringify(blockedInput));
        }
        return;

      default:
        // 未知动作，发送到监控系统
        const defaultResult = await sendToMonitor(command, ruleResult);

        if (defaultResult.approved) {
          process.stdout.write(raw);
        } else {
          const blockedInput = {
            ...input,
            tool_input: {
              ...input.tool_input,
              command: `echo "🛡️ [Aegis] 命令被阻止: ${defaultResult.reason}"`
            }
          };
          process.stdout.write(JSON.stringify(blockedInput));
        }
    }

  } catch (error) {
    // 出错时默认允许，避免阻塞正常工作流
    process.stderr.write(`[Aegis] Hook error: ${error.message}\n`);
    process.stdout.write(raw);
  }
});

async function sendToMonitor(command, ruleResult = null) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      type: 'approval_request',
      command: command,
      sessionId: Date.now() + '-' + Math.random().toString(36).substr(2, 8),
      agentType: 'claude-code',
      timestamp: new Date().toISOString(),
      context: {
        ruleEngine: ruleResult ? {
          action: ruleResult.action,
          reason: ruleResult.reason,
          category: ruleResult.category,
          pattern: ruleResult.pattern
        } : null
      }
    });

    const options = {
      hostname: '127.0.0.1',
      port: AEGIS_PORT,
      path: '/api/monitoring/approval-request',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 60000
    };

    const req = http.request(options, (res) => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(response);
          resolve({ approved: res.statusCode === 200, reason: result.reason || result.message });
        } catch {
          resolve({ approved: res.statusCode === 200, reason: 'Unknown' });
        }
      });
    });

    req.on('error', () => resolve({ approved: true, reason: 'Monitor not available' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ approved: true, reason: 'Timeout' });
    });

    req.write(data);
    req.end();
  });
}