#!/usr/bin/env node

/**
 * Aegis Smart Port Manager - 智能端口管理器
 * 解决开发环境端口冲突问题
 */

const net = require('net');

/**
 * 🎯 端口配置策略
 */
const PORT_CONFIG = {
  // 主服务端口 (Web界面)
  web: {
    default: 3001,
    envVar: 'AEGIS_WEB_PORT',
    range: [3001, 3009] // 备用端口范围
  },

  // WebSocket服务端口 (实时通信)
  websocket: {
    default: 8901, // ✅ 改为非常用端口
    envVar: 'AEGIS_WS_PORT',
    range: [8901, 8910] // 8900+ 系列，避开常用开发端口
  },

  // Hook拦截端口 (Agent CLI通信)
  hook: {
    default: 9876, // 保持当前端口，较少冲突
    envVar: 'AEGIS_HOOK_PORT',
    range: [9876, 9885]
  }
};

/**
 * 🔍 检测端口是否可用
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.listen(port, () => {
      server.once('close', () => {
        resolve(true); // 端口可用
      });
      server.close();
    });

    server.on('error', () => {
      resolve(false); // 端口被占用
    });
  });
}

/**
 * 🎯 智能端口选择器
 */
async function findAvailablePort(serviceName) {
  const config = PORT_CONFIG[serviceName];
  if (!config) {
    throw new Error(`未知服务: ${serviceName}`);
  }

  // 1. 优先检查环境变量
  const envPort = process.env[config.envVar];
  if (envPort) {
    const port = parseInt(envPort);
    if (await isPortAvailable(port)) {
      console.log(`✅ 使用环境变量端口: ${serviceName} → ${port}`);
      return port;
    } else {
      console.log(`⚠️ 环境变量端口被占用: ${port}，尝试备用端口...`);
    }
  }

  // 2. 检查默认端口
  if (await isPortAvailable(config.default)) {
    console.log(`✅ 使用默认端口: ${serviceName} → ${config.default}`);
    return config.default;
  }

  // 3. 自动寻找备用端口
  console.log(`⚠️ 默认端口 ${config.default} 被占用，寻找备用端口...`);

  for (let port of config.range) {
    if (await isPortAvailable(port)) {
      console.log(`✅ 找到可用端口: ${serviceName} → ${port}`);
      return port;
    }
  }

  // 4. 动态分配端口 (最后手段)
  const dynamicPort = await findRandomAvailablePort(config.range[config.range.length - 1] + 1);
  console.log(`🔄 动态分配端口: ${serviceName} → ${dynamicPort}`);
  return dynamicPort;
}

/**
 * 🔄 寻找随机可用端口
 */
async function findRandomAvailablePort(startPort = 8000) {
  for (let port = startPort; port < 65535; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error('无法找到可用端口');
}

/**
 * 📊 获取所有服务的端口配置
 */
async function getAllPorts() {
  const ports = {};

  for (const serviceName of ['web', 'websocket', 'hook']) {
    ports[serviceName] = await findAvailablePort(serviceName);
  }

  return ports;
}

/**
 * 💊 端口冲突诊断工具
 */
async function diagnosePortConflicts() {
  console.log('\n🔍 Aegis 端口冲突诊断');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const [serviceName, config] of Object.entries(PORT_CONFIG)) {
    const isAvailable = await isPortAvailable(config.default);
    const status = isAvailable ? '✅ 可用' : '❌ 占用';

    console.log(`${serviceName.padEnd(10)} | ${config.default} | ${status}`);

    if (!isAvailable) {
      // 显示占用进程信息
      try {
        const { execSync } = require('child_process');
        const result = execSync(`lsof -i :${config.default}`, { encoding: 'utf8' });
        console.log(`   占用信息: ${result.split('\n')[1] || '未知进程'}`);
      } catch (e) {
        console.log(`   占用信息: 无法获取详情`);
      }
    }
  }

  console.log('\n💡 解决方案:');
  console.log('1. 设置环境变量: export AEGIS_WS_PORT=8901');
  console.log('2. 使用自动端口: npm start (将自动选择可用端口)');
  console.log('3. 停止冲突服务: kill <PID>');
}

/**
 * 📝 生成端口配置文档
 */
function generatePortConfig(ports) {
  return `
# 🛡️ Aegis 当前端口配置

## 📊 服务端口分布
- **Web监控界面**: http://localhost:${ports.web}
- **WebSocket实时**: ws://localhost:${ports.websocket}
- **Hook拦截服务**: http://localhost:${ports.hook}

## 🔧 环境变量覆盖
\`\`\`bash
export AEGIS_WEB_PORT=${ports.web}
export AEGIS_WS_PORT=${ports.websocket}
export AEGIS_HOOK_PORT=${ports.hook}
\`\`\`

## ⚠️ 端口冲突解决
如遇端口冲突，Aegis会自动选择备用端口：
- WebSocket: 8901-8910 (避开常用开发端口3000-3009)
- Web: 3001-3009 (标准Web开发端口)
- Hook: 9876-9885 (高位端口，较少冲突)

生成时间: ${new Date().toLocaleString()}
`;
}

module.exports = {
  findAvailablePort,
  getAllPorts,
  diagnosePortConflicts,
  generatePortConfig,
  isPortAvailable,
  PORT_CONFIG
};

// CLI 命令支持
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case 'diagnose':
      diagnosePortConflicts();
      break;

    case 'find':
      const serviceName = process.argv[3];
      if (serviceName) {
        findAvailablePort(serviceName).then(port => {
          console.log(port);
        });
      } else {
        getAllPorts().then(ports => {
          console.log(JSON.stringify(ports, null, 2));
        });
      }
      break;

    default:
      console.log(`
🛡️ Aegis Port Manager

用法:
  node port-manager.js diagnose     # 诊断端口冲突
  node port-manager.js find         # 获取所有可用端口
  node port-manager.js find web     # 获取Web服务端口
      `);
  }
}