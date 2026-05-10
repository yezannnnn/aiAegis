#!/usr/bin/env node
/**
 * Aegis Universal Hook - Backend AST rule engine version
 *
 * Flow:
 *   1. POST /api/v1/rules/evaluate → AST parse + YAML rule sets + git context
 *   2. allow → pass through
 *   3. deny/block → output block JSON
 *   4. review → approval created + broadcast, hook long-polls for user decision
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
    console.error('[AEGIS HOOK] triggered at:', new Date().toISOString());
    console.error('[AEGIS HOOK] port:', AEGIS_PORT);

    if (!raw.includes('"tool_name"')) {
      console.error('[AEGIS HOOK] not a tool call, allowing');
      process.exit(0);
    }

    const input = JSON.parse(raw.trim());
    if (input.tool_name !== 'Bash' || !input.tool_input?.command) {
      console.error('[AEGIS HOOK] not a Bash tool, allowing');
      process.exit(0);
    }

    const command = input.tool_input.command;
    const sessionId = input.session_id;
    const cwd = input.cwd || process.cwd();
    const transcriptPath = input.transcript_path;
    const toolUseId = input.tool_use_id;
    const model = extractModelFromTranscript(transcriptPath, sessionId);
    const persona = extractPersonaFromCwd(cwd);
    const taskId = loadTaskId(sessionId);
    const { userInput, assistPrompt } = loadContext(sessionId, transcriptPath);

    console.error(`[AEGIS HOOK] command: ${command}`);
    console.error(`[AEGIS HOOK] session: ${sessionId}`);
    console.error(`[AEGIS HOOK] model: ${model || 'unknown'}`);
    console.error(`[AEGIS HOOK] taskId: ${taskId || 'unknown'}`);
    console.error(`[AEGIS HOOK] userInput: ${userInput ? userInput.substring(0, 80) : 'unknown'}`);
    console.error(`[AEGIS HOOK] assistPrompt: ${assistPrompt ? assistPrompt.substring(0, 80) : 'unknown'}`);

    const result = await evaluateWithBackend(command, sessionId, cwd, model, persona, taskId, userInput, assistPrompt);

    if (!result) {
      console.error('[Aegis] ⚠️ Backend unavailable, allowing by default');
      process.exit(0);
    }

    const { evaluation, requiresApproval, approvalRequestId } = result;
    console.error(`[Aegis] evaluated: action=${evaluation.action}, severity=${evaluation.severity}, reason=${evaluation.reason}`);
    if (evaluation.matchedRules && evaluation.matchedRules.length > 0) {
      console.error(`[Aegis] matched rules: ${evaluation.matchedRules.join(', ')}`);
    }

    switch (evaluation.action) {
      case 'allow':
        console.error('[Aegis] ✅ Allowed by rules, executing');
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
        console.error(`[Aegis] 📋 Command intercepted: ${evaluation.reason}`);
        console.error(`[Aegis] 👉 Approve at http://localhost:${AEGIS_PORT}`);
        console.error(`[Aegis] ⏳ Waiting for approval (max 30s)...`);

        if (!approvalRequestId) {
          console.error('[Aegis] ❌ Failed to create approval request, denying');
          process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: '[Aegis] Failed to create approval request',
            }
          }));
          process.exit(0);
          break;
        }

        // Poll for approval (every 2s, max 30s)
        const decision = await pollForApproval(approvalRequestId, 30);

        if (decision && decision.status === 'approved') {
          console.error('[Aegis] ✅ Approved, executing command');
          process.exit(0);
        } else {
          if (!decision) {
            await markApprovalAsTimedOut(approvalRequestId);
          }
          const reason = decision?.reason || 'Approval timed out';
          console.error(`[Aegis] ❌ Not approved: ${reason}`);
          process.stdout.write(JSON.stringify({
            systemMessage: `🛡️ Aegis: ${evaluation.reason}\n⏱️ Approval timed out — visit http://localhost:${AEGIS_PORT} to approve and retry`,
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: `[Aegis] ${reason} — approve at http://localhost:${AEGIS_PORT} and retry`,
            }
          }));
          process.exit(0);
        }
        break;

      default:
        console.error(`[Aegis] Unknown action: ${evaluation.action}, allowing by default`);
        process.exit(0);
    }

  } catch (error) {
    console.error(`[Aegis] Hook error: ${error.message}`);
    // default allow on error to avoid blocking normal workflow
    process.exit(0);
  }
});

/** Read taskId from index (written by PostToolUse handler) */
function loadTaskId(sessionId) {
  if (!sessionId) return null;
  try {
    const indexFile = path.join(os.homedir(), '.aegis', 'sessions', `${sessionId}.json`);
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    return index.lastTaskId || null;
  } catch {}
  return null;
}

/**
 * Load context (user input + AI thinking)
 *   1. Scan transcript tail for last real user message
 *   2. Compare with PostToolUse index — mismatch means new turn → use scan result
 *   3. Match → use index (already validated by PostToolUse)
 *   4. assistPrompt always read from index (validated by PostToolUse)
 */
function loadContext(sessionId, transcriptPath) {
  const result = { userInput: null, assistPrompt: null };
  if (!sessionId) return result;

  // always scan transcript tail for the last real user message
  const scanned = scanLastUserInput(transcriptPath, sessionId);

  // read PostToolUse index
  const indexFile = path.join(os.homedir(), '.aegis', 'sessions', `${sessionId}.json`);
  try {
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

    if (index.lastUserInput) {
      if (scanned && scanned !== index.lastUserInput) {
        // new turn — index is stale, use scan result and scan transcript for current thinking
        console.error(`[Aegis] 🔄 New user input detected, using scanned result`);
        result.userInput = scanned;
        result.assistPrompt = scanLastAssistPrompt(transcriptPath, sessionId);
      } else {
        console.error(`[Aegis] 📝 Context loaded from index`);
        result.userInput = index.lastUserInput;
        result.assistPrompt = index.lastAssistPrompt || null;
      }
      return result;
    }
  } catch {}

  // no index, fall back to scan result
  result.userInput = scanned;
  if (scanned) {
    console.error('[Aegis] 🔍 Fallback scan for user input');
  }
  return result;
}

/**
 * 回退方案：扫描 transcript 尾部，找最后一条真实用户输入
 * 不过滤 system 消息（toolUseResult, isCompactSummary）
 * 不需要匹配 tool_use_id，只需取最后一条 user 消息
 */
function scanLastUserInput(transcriptPath, sessionId) {
  const filePath = findTranscriptFile(transcriptPath, sessionId);
  if (!filePath) return null;

  try {
    // 只读尾部 1MB，最后一条 user 消息通常在附近
    const stat = fs.statSync(filePath);
    const readSize = Math.min(1024 * 1024, stat.size);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);
    let content = buf.toString('utf8');
    const firstNewline = content.indexOf('\n');
    if (firstNewline > 0 && readSize < stat.size) {
      content = content.substring(firstNewline + 1);
    }

    const lines = content.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        if (d.type !== 'user') continue;
        if (d.toolUseResult || d.isCompactSummary) continue;
        const text = extractText(d.message?.content);
        if (text) {
          console.error('[Aegis] 🔍 Fallback scan for user input');
          return text;
        }
      } catch {}
    }
  } catch {}
  return null;
}

/** 扫描 transcript 尾部，找最后一条 assistant 的 thinking/text */
function scanLastAssistPrompt(transcriptPath, sessionId) {
  const filePath = findTranscriptFile(transcriptPath, sessionId);
  if (!filePath) return null;

  try {
    const stat = fs.statSync(filePath);
    const readSize = Math.min(512 * 1024, stat.size);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);
    let content = buf.toString('utf8');
    const firstNewline = content.indexOf('\n');
    if (firstNewline > 0 && readSize < stat.size) {
      content = content.substring(firstNewline + 1);
    }

    const lines = content.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        if (d.type !== 'assistant') continue;
        const texts = [];
        const c = d.message?.content;
        if (Array.isArray(c)) {
          for (const b of c) {
            if ((b?.type === 'thinking' || b?.type === 'text') && b[b.type]?.trim()) {
              texts.push(b[b.type].trim());
            }
          }
        }
        if (texts.length > 0) {
          console.error('[Aegis] 🤖 Scanned AI thinking from transcript');
          return texts.join(' ');
        }
      } catch {}
    }
  } catch {}
  return null;
}

function extractText(content) {
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;
  const texts = content
    .filter(b => b?.type === 'text' && b.text?.trim())
    .map(b => b.text.trim());
  return texts.length > 0 ? texts.join(' ') : null;
}

function findTranscriptFile(transcriptPath, sessionId) {
  if (transcriptPath && fs.existsSync(transcriptPath)) return transcriptPath;
  if (sessionId) {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    try {
      for (const proj of fs.readdirSync(projectsDir)) {
        const p = path.join(projectsDir, proj, `${sessionId}.jsonl`);
        if (fs.existsSync(p)) return p;
      }
    } catch {}
  }
  return null;
}

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
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
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
function evaluateWithBackend(command, sessionId, cwd, model, persona, taskId, userInput, assistPrompt) {
  return new Promise((resolve) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const data = JSON.stringify({
      command,
      sessionId: sessionId || 'unknown',
      agentType: 'claude-code',
      cwd: cwd || process.cwd(),
      model: model || null,
      persona: persona || null,
      taskId: taskId || null,
      userInput: userInput || null,
      assistPrompt: assistPrompt || null,
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
            console.error(`[Aegis] Evaluation API error: ${res.statusCode} - ${response}`);
            resolve(null);
          }
        } catch (e) {
          console.error(`[Aegis] Failed to parse evaluation response: ${e.message}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`[Aegis] Backend connection failed: ${e.message}`);
      resolve(null);
    });
    req.on('timeout', () => {
      req.destroy();
      console.error('[Aegis] Backend connection timed out');
      resolve(null);
    });

    req.write(data);
    req.end();
  });
}

/** Poll for approval status every 2 seconds */
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
              console.error(`[Aegis] Approval result: ${result.status} (attempt ${attempts})`);
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
/** Notify backend that approval has timed out */
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
          console.error(`[Aegis] ⏰ Approval marked as timed out: ${result.status}`);
        } catch (e) {
          console.error(`[Aegis] ⏰ Approval timeout marked`);
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(`[Aegis] Failed to mark timeout: ${e.message}`);
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

