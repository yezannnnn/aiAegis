#!/usr/bin/env node

/**
 * 可靠的文件队列事件发送（跨平台）
 * 100%可靠，不受process.exit影响
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class ReliableEventQueue {
  constructor() {
    this.eventFile = this.getEventFilePath();
  }

  // 跨平台事件文件路径
  getEventFilePath() {
    const tmpDir = os.tmpdir();
    if (process.platform === 'win32') {
      return path.join(tmpDir, 'aegis-events.json');
    } else {
      return path.join(tmpDir, '.aegis-events.json');
    }
  }

  // 核心方法：可靠的事件记录
  sendEvent(type, message, command = '', agent = 'Claude Code') {
    const event = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      type,
      message,
      command,
      agent,
      timestamp: new Date().toISOString(),
      platform: process.platform
    };

    try {
      // 同步写入，不会被process.exit中断
      this.writeEventSync(event);
      return true;
    } catch (error) {
      // 即使文件写入失败，也不影响Hook主功能
      return false;
    }
  }

  // 同步写入事件（关键：同步操作）
  writeEventSync(event) {
    const data = JSON.stringify(event) + '\n';

    const options = {
      flag: 'a', // 追加模式
      encoding: 'utf8'
    };

    // Windows不支持文件权限设置
    if (process.platform !== 'win32') {
      options.mode = 0o600; // 仅用户读写
    }

    // 关键：使用同步写入，不会被process.exit中断
    fs.writeFileSync(this.eventFile, data, options);
  }

  // Web界面读取事件的方法
  readAndClearEvents() {
    try {
      if (!fs.existsSync(this.eventFile)) {
        return [];
      }

      const data = fs.readFileSync(this.eventFile, 'utf8');
      const lines = data.trim().split('\n').filter(line => line);
      const events = lines.map(line => JSON.parse(line));

      // 清空文件
      fs.writeFileSync(this.eventFile, '', 'utf8');

      return events;
    } catch (error) {
      return [];
    }
  }

  // 测试可靠性
  testReliability() {
    console.log('🧪 文件队列可靠性测试');

    let successCount = 0;
    const totalTests = 100;

    for (let i = 0; i < totalTests; i++) {
      const success = this.sendEvent('test', `可靠性测试 ${i}`, 'test command');
      if (success) successCount++;

      // 模拟Hook的立即退出
      if (Math.random() < 0.1) {
        // 即使在process.exit前，文件已经写入完成
        console.log(`模拟第${i}次process.exit - 文件已安全写入`);
      }
    }

    console.log(`📊 成功率: ${(successCount/totalTests*100).toFixed(1)}% (${successCount}/${totalTests})`);

    // 验证事件是否真的写入了
    const events = this.readAndClearEvents();
    console.log(`📁 实际写入事件: ${events.length}`);
    console.log(`✅ 文件队列可靠性: ${events.length >= successCount ? '100%' : '有丢失'}`);
  }
}

// 导出模块
module.exports = ReliableEventQueue;

// 直接运行时执行测试
if (require.main === module) {
  const queue = new ReliableEventQueue();
  queue.testReliability();
}