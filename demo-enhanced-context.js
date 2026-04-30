#!/usr/bin/env node
/**
 * Enhanced Context Demo - 演示增强的上下文信息
 *
 * 模拟Agent发送危险命令请求，展示新的AST分析和丰富上下文
 */

const net = require('net');
const crypto = require('crypto');

// 模拟的危险命令请求
const dangerousCommands = [
  {
    command: 'git push --force origin main',
    agentType: 'hermes',
    description: 'AI尝试强制推送到主分支'
  },
  {
    command: 'rm -rf /Users/yuhao/important-data',
    agentType: 'openclaw',
    description: 'AI尝试删除重要数据目录'
  },
  {
    command: 'mysql -h prod-db.company.com -e "DROP DATABASE customers"',
    agentType: 'hermes',
    description: 'AI尝试删除生产数据库'
  },
  {
    command: 'sudo chmod 777 /etc/passwd',
    agentType: 'openclaw',
    description: 'AI尝试修改系统文件权限'
  }
];

async function sendMockRequest(command, agentType) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    const request = {
      type: 'approval_request',
      payload: {
        id: crypto.randomUUID(),
        command: command,
        argv: command.split(' '),
        cwd: process.cwd(),
        agentType: agentType,
        sessionKey: 'demo-session-' + Date.now(),
        timestamp: Date.now()
      }
    };

    console.log(`📤 发送请求: ${command}`);

    client.connect(9876, '127.0.0.1', () => {
      client.write(JSON.stringify(request) + '\n');
    });

    let response = '';
    client.on('data', (data) => {
      response += data.toString();
      const lines = response.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          console.log(`✅ 收到响应: ${parsed.type}`);
          client.destroy();
          resolve(parsed);
        } catch (e) {
          // 忽略解析错误，等待完整响应
        }
      }
    });

    client.on('error', (err) => {
      console.error(`❌ 连接错误: ${err.message}`);
      reject(err);
    });

    client.on('close', () => {
      resolve(null);
    });
  });
}

async function checkDaemonRunning() {
  return new Promise((resolve) => {
    const client = new net.Socket();

    client.connect(9876, '127.0.0.1', () => {
      client.destroy();
      resolve(true);
    });

    client.on('error', () => {
      resolve(false);
    });
  });
}

async function runDemo() {
  console.log('🛡 Aegis Enhanced Context Demo');
  console.log('展示AST解析和丰富上下文信息\n');

  // 检查daemon是否运行
  const isRunning = await checkDaemonRunning();

  if (!isRunning) {
    console.log('❌ Aegis Daemon未运行');
    console.log('\n请先启动Monitor:');
    console.log('  npm start -- monitor');
    console.log('\n然后在另一个终端运行此演示:');
    console.log('  node demo-enhanced-context.js');
    return;
  }

  console.log('✅ 检测到Aegis Daemon运行中');
  console.log('\n🎬 开始发送模拟请求...\n');

  for (let i = 0; i < dangerousCommands.length; i++) {
    const { command, agentType, description } = dangerousCommands[i];

    console.log(`\n--- 请求 ${i + 1}/${dangerousCommands.length} ---`);
    console.log(`场景: ${description}`);

    try {
      await sendMockRequest(command, agentType);

      // 给用户时间在Monitor中查看请求
      console.log('⏳ 请在Aegis Monitor中查看增强的上下文信息');
      console.log('   - 注意命令结构分析');
      console.log('   - 环境警告信息');
      console.log('   - 风险评估详情');
      console.log('   - 按 [I] 查看详细分析\n');

      // 等待用户处理
      await new Promise(resolve => setTimeout(resolve, 8000));

    } catch (error) {
      console.error(`请求失败: ${error.message}`);
    }
  }

  console.log('\n🎉 演示完成!');
  console.log('\n💡 增强的上下文信息包括:');
  console.log('  ✓ AST命令结构解析');
  console.log('  ✓ Git状态和分支信息');
  console.log('  ✓ 项目环境检测');
  console.log('  ✓ 系统权限分析');
  console.log('  ✓ 智能风险评估');
  console.log('  ✓ 安全建议和替代方案');
  console.log('  ✓ 详细解释对话框([I]键)');
}

// 运行演示
runDemo().catch(console.error);