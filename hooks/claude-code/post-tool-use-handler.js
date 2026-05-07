#!/usr/bin/env node
/**
 * Aegis PostToolUse Hook v2
 *
 * 1. 从 transcript 反查 tool_use_id → parentUuid → 用户输入
 * 2. 写入索引文件 ~/.aegis/sessions/{session_id}.json
 * 3. 通知后端命令执行结果
 *
 * 为什么 PostToolUse 靠谱：
 *   - assistant 消息（含 tool_use_id）此时已完整写入 JSONL
 *   - parentUuid 直接就是 user 消息的 uuid，只需 1 跳
 *   - 没有 PreToolUse 的竞态问题
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MAX_STDIN = 1024 * 1024;
const TAIL_SIZES = [2 * 1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024]; // 渐进式读取

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
    if (!raw.includes('"tool_name"')) {
      process.exit(0);
    }

    const input = JSON.parse(raw.trim());
    if (input.tool_name !== 'Bash') {
      process.exit(0);
    }

    const sessionId = input.session_id;
    const toolUseId = input.tool_use_id;
    const transcriptPath = input.transcript_path;

    // 1. 索引用户输入 + AI 想法
    if (sessionId && toolUseId) {
      const result = extractContext(toolUseId, transcriptPath, sessionId);
      if (result) {
        saveContextIndex(sessionId, result.userInput, result.assistPrompt, result.taskId, toolUseId);
      }
    }

    // 2. 通知后端命令执行结果（保持原有逻辑）
    const data = JSON.stringify({
      sessionId: sessionId,
      command: input.tool_input?.command,
      success: input.tool_response?.success ?? true,
      exitCode: input.tool_response?.exitCode ?? 0,
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: AEGIS_PORT,
      path: '/api/monitoring/command-result',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 3000,
    }, () => {});

    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.write(data);
    req.end();
    process.exit(0);
  } catch {
    process.exit(0);
  }
});

/**
 * 从 transcript 提取 tool_use_id 对应的用户输入 + AI 想法
 * 返回 {userInput, assistPrompt}
 */
function extractContext(toolUseId, transcriptPath, sessionId) {
  const filePath = findTranscriptFile(transcriptPath, sessionId);
  if (!filePath) {
    console.error('[Aegis PostToolUse] ⚠️ 找不到 transcript 文件');
    return null;
  }

  let content = null;

  // 渐进式读取
  for (const size of TAIL_SIZES) {
    content = readTail(filePath, size);
    if (!content) continue;
    if (content.includes(toolUseId)) break;
    content = null;
  }

  // 兜底：读全文件
  if (!content) {
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  if (!content || !content.includes(toolUseId)) {
    console.error('[Aegis PostToolUse] ⚠️ 在 transcript 中未找到 tool_use_id:', toolUseId);
    return null;
  }

  const lines = content.split('\n');

  // 找包含 tool_use_id 的 assistant 行
  let assistantLineIdx = -1;
  let assistantEntry = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim() || !line.includes(toolUseId)) continue;
    try {
      const d = JSON.parse(line);
      if (d.type === 'assistant') {
        assistantLineIdx = i;
        assistantEntry = d;
        break;
      }
    } catch {}
  }

  if (assistantLineIdx < 0 || !assistantEntry) {
    console.error('[Aegis PostToolUse] ⚠️ 未找到 assistant 条目');
    return null;
  }

  // 提取 AI 想法：可能在同一条 assistant 的 thinking 块，也可能在前一条 assistant（中间隔了 tool_result）
  // 结构: assistant(thinking) → user(tool_result) → assistant(tool_use)
  let assistPrompt = extractAssistPrompt(assistantEntry);
  if (!assistPrompt) {
    // 检查前一条 assistant（跳过中间的 tool_result user）
    for (let i = assistantLineIdx - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        if (d.type === 'user' && isToolResult(d)) continue;
        if (d.type === 'assistant') {
          assistPrompt = extractAssistPrompt(d);
          break;
        }
        break; // 遇到非 tool_result 也停下
      } catch {}
    }
  }

  // 从 assistant 行向前扫描，找最近的真实用户输入
  let userInput = null;
  let taskId = null;
  for (let i = assistantLineIdx - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      if (d.type !== 'user') continue;
      if (d.isCompactSummary) continue;
      if (isToolResult(d)) continue;

      const text = extractTextFromContent(d.message?.content);
      if (text) {
        userInput = text;
        taskId = d.uuid || null;  // 用户消息的 uuid 作为 taskId
        console.error(`[Aegis PostToolUse] ✅ 用户输入 (回溯 ${assistantLineIdx - i} 行, taskId=${(taskId||'').slice(0,8)}): ${text.substring(0, 80)}...`);
        break;
      }
    } catch {}
  }

  if (!userInput) {
    console.error('[Aegis PostToolUse] ⚠️ 未找到用户输入');
    return null;
  }

  if (assistPrompt) {
    console.error(`[Aegis PostToolUse] 🤖 AI 想法: ${assistPrompt.substring(0, 80)}...`);
  }

  return { userInput, assistPrompt, taskId };
}

/** 从 assistant 消息提取 thinking/text（AI 的想法/总结） */
function extractAssistPrompt(entry) {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return null;
  const texts = content
    .filter(b => (b?.type === 'thinking' || b?.type === 'text') && b[b.type]?.trim())
    .map(b => b[b.type].trim());
  return texts.length > 0 ? texts.join(' ') : null;
}

/** 判断 user entry 是否是 tool_result（含 tool_use_id 的 content block） */
function isToolResult(entry) {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some(b => b?.type === 'tool_result' || b?.tool_use_id);
}

/** 从 message.content 提取文本 */
function extractTextFromContent(content) {
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;
  const texts = content
    .filter(b => b?.type === 'text' && b.text?.trim())
    .map(b => b.text.trim());
  return texts.length > 0 ? texts.join(' ') : null;
}

/** 找 transcript 文件 */
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

/** 读文件尾部 N 字节 */
function readTail(filePath, size) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return null;
    const readSize = Math.min(size, stat.size);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);
    // 跳过可能的不完整首行
    let content = buf.toString('utf8');
    const firstNewline = content.indexOf('\n');
    if (firstNewline > 0 && readSize < stat.size) {
      content = content.substring(firstNewline + 1);
    }
    return content;
  } catch {
    return null;
  }
}

/** 写入上下文索引（用户输入 + AI 想法） */
function saveContextIndex(sessionId, userInput, assistPrompt, taskId, toolUseId) {
  const sessionsDir = path.join(os.homedir(), '.aegis', 'sessions');
  try {
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
    const index = {
      lastUserInput: userInput,
      lastAssistPrompt: assistPrompt || null,
      lastTaskId: taskId || null,
      lastToolUseId: toolUseId,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(sessionsDir, `${sessionId}.json`),
      JSON.stringify(index, null, 2)
    );
    console.error('[Aegis PostToolUse] 📝 索引已更新');
  } catch (e) {
    console.error('[Aegis PostToolUse] ❌ 写入索引失败:', e.message);
  }
}
