#!/usr/bin/env node

/**
 * 跨平台事件发送模块 (Windows + macOS + Linux)
 * 支持HTTP主要通道 + 文件备份通道
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

class CrossPlatformEventSender {
  constructor() {
    this.webPort = 3001;
    this.timeout = 100; // 短超时，快速失败
    this.eventFile = this.getEventFilePath();
  }

  // 获取跨平台事件文件路径
  getEventFilePath() {
    const tmpDir = os.tmpdir();
    if (process.platform === 'win32') {
      return path.join(tmpDir, 'aegis-events.log');
    } else {
      return path.join(tmpDir, '.aegis-events');
    }
  }

  // 主要方法：发送事件
  async sendEvent(type, message, command = '', agent = 'Claude Code') {
    const event = {
      type,
      message,
      command,
      agent,
      timestamp: new Date().toISOString(),
      platform: process.platform
    };

    try {
      // 方案A：HTTP发送 (首选，全平台支持)
      await this.sendViaHTTP(event);
    } catch (httpError) {
      // 方案B：文件备份 (备选，全平台支持)
      this.sendViaFile(event);
    }
  }

  // HTTP发送 (全平台兼容)
  sendViaHTTP(event) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(event);
      const options = {
        hostname: '127.0.0.1',
        port: this.webPort,
        path: '/add-event',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: this.timeout
      };

      const req = http.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve('HTTP发送成功');
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('HTTP超时'));
      });

      req.write(data);
      req.end();
    });
  }

  // 文件备份 (全平台兼容)
  sendViaFile(event) {
    try {
      const data = JSON.stringify(event) + '\n';
      const options = {
        flag: 'a', // 追加模式
        encoding: 'utf8'
      };

      // Windows不支持文件权限，跳过mode设置
      if (process.platform !== 'win32') {
        options.mode = 0o600; // 仅用户可读写
      }

      fs.writeFileSync(this.eventFile, data, options);
    } catch (fileError) {
      // 文件写入失败也静默处理，确保不影响Hook主功能
    }
  }

  // 测试平台兼容性
  async testPlatformCompatibility() {
    console.log(`🌐 平台: ${process.platform}`);
    console.log(`📁 事件文件: ${this.eventFile}`);

    try {
      await this.sendEvent('test', '跨平台测试', 'test command', 'Platform Test');
      console.log('✅ 跨平台测试成功');
    } catch (error) {
      console.log('⚠️ 跨平台测试警告:', error.message);
    }
  }
}

// 导出跨平台模块
module.exports = CrossPlatformEventSender;

// 如果直接运行，执行测试
if (require.main === module) {
  const sender = new CrossPlatformEventSender();
  sender.testPlatformCompatibility();
}