#!/usr/bin/env node
/**
 * Aegis Universal Hook - 后端 AST 规则引擎版本
 *
 * 流程：
 *   1. POST /api/v1/rules/evaluate → AST解析 + 11个YAML规则集 + git上下文
 *   2. allow → 直接放行
 *   3. deny/block → 输出拒绝JSON
 *   4. review → 已自动创建审批 + 广播3001，Hook长轮询等待用户决策
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const MAX_STDIN = 1024 * 1024;

function loadAegisPort() {
  try {
    const configPath = path.join(path.dirname(__filename), 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config?.ports?.webInterface || 3001;
  } catch {
    return 3001;
  }
}

const AEGIS_PORT = loadAegisPort();

let raw = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length < MAX_STDIN) {
    raw += chunk.substring(0, MAX_STDIN - raw.length);
  }
});

process.stdin.on('end', async () => {
  try {
    console.error('🚨 [AEGIS HOOK] Hook被调用! 时间:', new Date().toISOString());
    console.error('🚨 [AEGIS HOOK] 端口:', AEGIS_PORT);

    if (!raw.includes('"tool_name"')) {
      console.error('🚨 [AEGIS HOOK] 非工具调用，直接允许');
      process.exit(0);
    }

    const input = JSON.parse(raw.trim());
    if (input.tool_name !== 'Bash' || !input.tool_input?.command) {
      console.error('🚨 [AEGIS HOOK] 非Bash工具，直接允许');
      process.exit(0);
    }

    const command = input.tool_input.command;
    const sessionId = input.session_id;
    const cwd = input.cwd || process.cwd();
    const transcriptPath = input.transcript_path;
    const model = extractModelFromTranscript(transcriptPath, sessionId);
    const persona = extractPersonaFromCwd(cwd);

    console.error(`🚨 [AEGIS HOOK] 处理Bash命令: ${command}`);
    console.error(`🚨 [AEGIS HOOK] 会话ID: ${sessionId}`);
    console.error(`🚨 [AEGIS HOOK] 模型: ${model || 'unknown'}`);
    console.error(`🚨 [AEGIS HOOK] 人设: ${persona || 'unknown'}`);

    // 调用后端 AST 规则引擎
    const result = await evaluateWithBackend(command, sessionId, cwd, model, persona);

    if (!result) {
      // 后端不可用，默认允许（避免阻塞正常工作流）
      console.error('[Aegis] ⚠️ 后端不可用，默认允许');
      process.exit(0);
    }

    const { evaluation, requiresApproval, approvalRequestId } = result;
    console.error(`[Aegis] AST评估: action=${evaluation.action}, severity=${evaluation.severity}, reason=${evaluation.reason}`);
    if (evaluation.matchedRules && evaluation.matchedRules.length > 0) {
      console.error(`[Aegis] 命中规则: ${evaluation.matchedRules.join(', ')}`);
    }

    switch (evaluation.action) {
      case 'allow':
        console.error('[Aegis] ✅ 规则引擎允许，命令直接执行');
        process.exit(0);
        break;

      case 'deny':
      case 'block':
        console.error(`[Aegis] BLOCKED: ${evaluation.reason}`);
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `[Aegis] ${evaluation.reason}`,
          }
        }));
        process.exit(0);
        break;

      case 'review':
        console.error(`[Aegis] 📋 当前命令被 Aegis 拦截: ${evaluation.reason}`);
        console.error(`[Aegis] 👉 请在 http://localhost:${AEGIS_PORT} 进行审批`);
        console.error(`[Aegis] ⏳ 等待审批中 (最多30秒)...`);

        if (!approvalRequestId) {
          console.error('[Aegis] ❌ 未能创建审批请求，拒绝执行');
          process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: '[Aegis] 无法创建审批请求',
            }
          }));
          process.exit(0);
          break;
        }

        // 短轮询等待审批（每2秒检查一次，最多30秒）
        const decision = await pollForApproval(approvalRequestId, 30);

        if (decision && decision.status === 'approved') {
          console.error('[Aegis] ✅ 3001审批通过，允许执行');
          process.exit(0);
        } else {
          // 超时（decision === null）则通知后端标记
          if (!decision) {
            await markApprovalAsTimedOut(approvalRequestId);
          }
          const reason = decision?.reason || '审批超时';
          console.error(`[Aegis] ❌ 审批未通过: ${reason}`);
          process.stdout.write(JSON.stringify({
            systemMessage: `🛡️ Aegis: ${evaluation.reason}\n⏱️ 审批超时 — 请先到 http://localhost:${AEGIS_PORT} 审批后再重试`,
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: `[Aegis] ${reason} — 请在 http://localhost:${AEGIS_PORT} 审批后重试`,
            }
          }));
          process.exit(0);
        }
        break;

      default:
        console.error(`[Aegis] 未知动作: ${evaluation.action}，默认允许`);
        process.exit(0);
    }

  } catch (error) {
    console.error(`[Aegis] Hook error: ${error.message}`);
    // 出错默认允许，避免阻塞正常工作流
    process.exit(0);
  }
});

/** 从 cwd 的 PERSONA.md 提取人设名，fallback 到目录名 */
function extractPersonaFromCwd(cwd) {
  if (!cwd) return null;
  // 尝试读 PERSONA.md，提取第一个 # 标题里的名字
  const personaFile = path.join(cwd, 'PERSONA.md');
  try {
    const content = fs.readFileSync(personaFile, 'utf8');
    const match = content.match(/^#\s+(.+)/m);
    if (match) {
      // 取括号里的英文名，如 "贾维斯 (Jarvis)" → "Jarvis"
      const parenMatch = match[1].match(/\(([^)]+)\)/);
      return parenMatch ? parenMatch[1] : match[1].trim();
    }
  } catch {}
  // fallback：用 cwd 最后一级目录名
  return path.basename(cwd) || null;
}

/** 从 transcript JSONL 提取最近使用的模型名 */
function extractModelFromTranscript(transcriptPath, sessionId) {
  // 优先用 transcript_path，否则按 session_id 查找
  const candidates = [];
  if (transcriptPath) candidates.push(transcriptPath);
  if (sessionId) {
    const projectsDir = path.join(require('os').homedir(), '.claude', 'projects');
    try {
      for (const proj of fs.readdirSync(projectsDir)) {
        const candidate = path.join(projectsDir, proj, `${sessionId}.jsonl`);
        if (fs.existsSync(candidate)) candidates.push(candidate);
      }
    } catch {}
  }
  for (const filePath of candidates) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trimEnd().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          // model 可能在顶层或 message.model 里（assistant 类型）
          if (obj.model) return obj.model;
          if (obj.message?.model) return obj.message.model;
        } catch {}
      }
    } catch {}
  }
  return null;
}

/** 调用后端 AST 规则引擎评估命令 */
function evaluateWithBackend(command, sessionId, cwd, model, persona) {
  return new Promise((resolve) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const data = JSON.stringify({
      command,
      sessionId: sessionId || 'unknown',
      agentType: 'claude-code',
      cwd: cwd || process.cwd(),
      model: model || null,
      persona: persona || null,
      requestId,
    });

    const options = {
      hostname: '127.0.0.1',
      port: AEGIS_PORT,
      path: '/api/v1/rules/evaluate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(response));
          } else {
            console.error(`[Aegis] 评估接口返回错误: ${res.statusCode} - ${response}`);
            resolve(null);
          }
        } catch (e) {
          console.error(`[Aegis] 解析评估响应失败: ${e.message}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`[Aegis] 连接后端失败: ${e.message}`);
      resolve(null);
    });
    req.on('timeout', () => {
      req.destroy();
      console.error('[Aegis] 连接后端超时');
      resolve(null);
    });

    req.write(data);
    req.end();
  });
}

/** 短轮询检查审批状态（每2秒检查一次） */
function pollForApproval(approvalId, maxWaitSec) {
  return new Promise((resolve) => {
    const pollInterval = 2000;
    let attempts = 0;
    const maxAttempts = Math.ceil(maxWaitSec * 1000 / pollInterval);

    function check() {
      attempts++;
      const options = {
        hostname: '127.0.0.1',
        port: AEGIS_PORT,
        path: `/api/monitoring/approval-status/${approvalId}`,
        method: 'GET',
        timeout: 3000,
      };

      const req = http.request(options, (res) => {
        let response = '';
        res.on('data', chunk => response += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(response);
            if (result.status && result.status !== 'pending') {
              console.error(`[Aegis] 审批结果: ${result.status} (第${attempts}次检查)`);
              resolve({ status: result.status, reason: result.reason });
              return;
            }
          } catch (e) { /* ignore parse errors */ }

          if (attempts >= maxAttempts) {
            resolve(null);
            return;
          }
          setTimeout(check, pollInterval);
        });
      });

      req.on('error', () => {
        if (attempts >= maxAttempts) resolve(null);
        else setTimeout(check, pollInterval);
      });
      req.on('timeout', () => {
        req.destroy();
        if (attempts >= maxAttempts) resolve(null);
        else setTimeout(check, pollInterval);
      });
      req.end();
    }

    check();
  });
}
/** 通知后端审批已超时 */
function markApprovalAsTimedOut(approvalId) {
  return new Promise((resolve) => {
    const data = JSON.stringify({});
    const options = {
      hostname: '127.0.0.1',
      port: AEGIS_PORT,
      path: `/api/monitoring/approval-timeout/${approvalId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(response);
          console.error(`[Aegis] ⏰ 审批已标记超时: ${result.status}`);
        } catch (e) {
          console.error(`[Aegis] ⏰ 审批超时标记完成`);
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(`[Aegis] 标记超时失败: ${e.message}`);
      resolve();
    });
    req.on('timeout', () => {
      req.destroy();
      resolve();
    });

    req.write(data);
    req.end();
  });
}

