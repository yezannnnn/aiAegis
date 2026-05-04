#!/usr/bin/env node
/**
 * Aegis Hook - npm 版本入口点
 * 通过 npm install aegis 后可用的 hook
 */

const path = require('path');
const fs = require('fs');

// 🔍 检测安装方式和路径
function getHookPath() {
  // 方式1: npm global install
  const globalHook = path.join(__dirname, '../dist/universal-hook.js');
  if (fs.existsSync(globalHook)) {
    return globalHook;
  }

  // 方式2: npm local install
  const localHook = path.join(__dirname, '../node_modules/aegis/dist/universal-hook.js');
  if (fs.existsSync(localHook)) {
    return localHook;
  }

  // 方式3: 开发环境
  const devHook = path.join(__dirname, '../universal-hook.js');
  if (fs.existsSync(devHook)) {
    return devHook;
  }

  // 方式4: ~/.aegis 用户配置
  const userHook = path.join(require('os').homedir(), '.aegis/universal-hook.js');
  if (fs.existsSync(userHook)) {
    return userHook;
  }

  throw new Error('Aegis universal hook not found. Please run: npm run setup');
}

// 🚀 启动实际的 hook
try {
  const hookPath = getHookPath();
  require(hookPath);
} catch (error) {
  console.error('[Aegis Hook] Error:', error.message);
  console.error('[Aegis Hook] Please run: npm run setup');
  process.exit(1);
}