#!/usr/bin/env node
/**
 * Aegis Hook 跨平台部署脚本
 * 用法: node deploy.js [--settings /path/to/settings.json]
 *
 * 自动检测 OS，将 hook 脚本复制到 ~/.aegis/，并更新 Claude Code 配置
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const AEGIS_DIR = path.join(os.homedir(), '.aegis');
const HOOK_FILES = ['universal-hook-v2.js', 'post-tool-use-handler.js'];

// ── CLI 参数 ──────────────────────────────────────────
const args = process.argv.slice(2);
let settingsPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--settings' && args[i + 1]) {
    settingsPath = args[++i];
  }
}
// 默认写入用户级全局配置
if (!settingsPath) {
  settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
}

// ── Step 1: 复制 hook 文件 ───────────────────────────
console.log(`\n📦 部署 Hook 到 ${AEGIS_DIR}\n`);

if (!fs.existsSync(AEGIS_DIR)) {
  fs.mkdirSync(AEGIS_DIR, { recursive: true });
}

const srcDir = __dirname;
for (const file of HOOK_FILES) {
  const src = path.join(srcDir, file);
  const dst = path.join(AEGIS_DIR, file);
  if (!fs.existsSync(src)) {
    console.error(`❌ 源文件不存在: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dst);
  console.log(`  ✅ ${file}`);
}

// ── Step 2: 更新 settings.json ────────────────────────
console.log(`\n⚙️  更新配置: ${settingsPath}\n`);

const settingsDir = path.dirname(settingsPath);
if (!fs.existsSync(settingsDir)) {
  fs.mkdirSync(settingsDir, { recursive: true });
}

let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    console.error(`⚠️  解析现有配置失败，将创建新配置: ${e.message}`);
  }
}

// 构建 hook 命令（使用绝对路径，跨平台兼容）
const preToolUseCmd = `node "${path.join(AEGIS_DIR, 'universal-hook-v2.js')}"`;
const postToolUseCmd = `node "${path.join(AEGIS_DIR, 'post-tool-use-handler.js')}"`;

// 初始化 hooks 结构
if (!settings.hooks) settings.hooks = {};

// PreToolUse: 如果已有则替换 Bash 匹配器，否则新增
settings.hooks.PreToolUse = mergeHookEntry(
  settings.hooks.PreToolUse || [],
  'Bash',
  preToolUseCmd,
  120
);

// PostToolUse: 同上
settings.hooks.PostToolUse = mergeHookEntry(
  settings.hooks.PostToolUse || [],
  'Bash',
  postToolUseCmd,
  10
);

// 写回
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`  ✅ PreToolUse  → ${preToolUseCmd}`);
console.log(`  ✅ PostToolUse → ${postToolUseCmd}`);

// ── Step 3: 总结 ──────────────────────────────────────
console.log(`\n🎉 部署完成！`);
console.log(`   Hook 目录: ${AEGIS_DIR}`);
console.log(`   配置文件:  ${settingsPath}`);
console.log(`   平台:      ${os.platform()} ${os.arch()}\n`);

// ── Helper ────────────────────────────────────────────
function mergeHookEntry(existingHooks, matcher, command, timeout) {
  const hooks = [...existingHooks];

  // 找到已有 Bash 匹配器的 hook
  const idx = hooks.findIndex(h => h.matcher === matcher);

  const newHook = {
    matcher,
    hooks: [{ type: 'command', command, timeout }],
  };

  if (idx >= 0) {
    // 替换该匹配器的 hook（只保留我们的 command hook）
    hooks[idx] = newHook;
  } else {
    hooks.push(newHook);
  }

  return hooks;
}
