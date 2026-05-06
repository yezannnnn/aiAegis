#!/usr/bin/env node
/**
 * postinstall.js — 在用户 npm install -g 后自动安装后端运行时依赖
 *
 * 失败时只警告，不阻断安装（用户可以手动运行 aegis setup 重试）
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const backendDir = path.join(__dirname, '..', 'backend');
const aegisDir = path.join(os.homedir(), '.aegis');
const dataDir = path.join(aegisDir, 'data');

function log(msg) { process.stdout.write(msg + '\n'); }
function warn(msg) { process.stderr.write('[aegis postinstall] ' + msg + '\n'); }

// 确保数据目录存在（放在用户主目录，始终可写）
try {
  fs.mkdirSync(dataDir, { recursive: true });
  log('[aegis] 数据目录已就绪: ' + dataDir);
} catch (e) {
  warn('无法创建数据目录: ' + e.message);
}

// 安装后端运行时依赖
if (!fs.existsSync(backendDir)) {
  warn('后端目录不存在，跳过依赖安装');
  process.exit(0);
}

try {
  log('[aegis] 正在安装后端运行时依赖（首次安装需要 1-2 分钟）...');
  execSync('npm install --production --legacy-peer-deps --no-audit --no-fund', {
    cwd: backendDir,
    stdio: 'pipe',
    timeout: 300000, // 5 分钟超时
  });
  log('[aegis] ✅ 后端依赖安装完成');
} catch (e) {
  warn('后端依赖安装失败（可能是权限问题）: ' + (e.stderr?.toString()?.slice(0, 200) || e.message));
  warn('请手动运行: cd ' + backendDir + ' && npm install --production --legacy-peer-deps');
  warn('或使用 sudo npm install -g aegis-monitor 重新安装');
  // 不 exit(1)，让安装继续
}
