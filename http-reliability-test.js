#!/usr/bin/env node

/**
 * HTTP方案可靠性深度测试
 * 模拟各种失败场景
 */

const http = require('http');

class HTTPReliabilityTester {
  constructor() {
    this.successCount = 0;
    this.failureCount = 0;
    this.timeoutCount = 0;
  }

  // 测试1：模拟当前Hook的时序问题
  async testCurrentHookTiming() {
    console.log('\n🔬 测试1: 当前Hook时序问题');

    for (let i = 0; i < 10; i++) {
      const success = await this.simulateCurrentHook();
      console.log(`第${i+1}次: ${success ? '✅' : '❌'}`);
    }
  }

  simulateCurrentHook() {
    return new Promise((resolve) => {
      const eventData = JSON.stringify({
        type: 'blocked',
        message: `时序测试 ${Date.now()}`,
        command: 'test command'
      });

      const options = {
        hostname: '127.0.0.1',
        port: 3001,
        path: '/add-event',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(eventData)
        },
        timeout: 1000
      };

      const req = http.request(options, (res) => {
        this.successCount++;
        resolve(true);
      });

      req.on('error', () => {
        this.failureCount++;
        resolve(false);
      });

      req.on('timeout', () => {
        this.timeoutCount++;
        req.destroy();
        resolve(false);
      });

      req.write(eventData);
      req.end();

      // 模拟Hook的立即退出问题
      setTimeout(() => {
        req.destroy(); // 模拟process.exit(2)杀死请求
        this.failureCount++;
        resolve(false);
      }, Math.random() * 20); // 0-20ms随机退出
    });
  }

  // 测试2：Web界面不可用时
  async testWebInterfaceDown() {
    console.log('\n🔬 测试2: Web界面不可用');

    // 测试错误端口
    const eventData = JSON.stringify({
      type: 'blocked',
      message: '端口测试',
      command: 'test command'
    });

    const options = {
      hostname: '127.0.0.1',
      port: 9999, // 不存在的端口
      path: '/add-event',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(eventData)
      },
      timeout: 100
    };

    try {
      await new Promise((resolve, reject) => {
        const req = http.request(options, resolve);
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('timeout'));
        });
        req.write(eventData);
        req.end();
      });
      console.log('❌ 应该失败但成功了');
    } catch (error) {
      console.log('✅ 正确检测到Web界面不可用:', error.code);
    }
  }

  // 测试3：网络延迟场景
  async testNetworkLatency() {
    console.log('\n🔬 测试3: 网络延迟场景');

    const startTime = Date.now();
    try {
      await this.sendEventWithTimeout(50); // 50ms超时
      console.log(`✅ 低延迟成功: ${Date.now() - startTime}ms`);
    } catch (error) {
      console.log(`❌ 低延迟失败: ${error.message}`);
    }
  }

  sendEventWithTimeout(timeout) {
    return new Promise((resolve, reject) => {
      const eventData = JSON.stringify({
        type: 'blocked',
        message: '延迟测试',
        command: 'test command'
      });

      const options = {
        hostname: '127.0.0.1',
        port: 3001,
        path: '/add-event',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(eventData)
        },
        timeout: timeout
      };

      const req = http.request(options, (res) => {
        resolve(res.statusCode);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });

      req.write(eventData);
      req.end();
    });
  }

  // 运行所有测试
  async runAllTests() {
    console.log('🧪 HTTP方案可靠性深度测试');

    await this.testCurrentHookTiming();
    await this.testWebInterfaceDown();
    await this.testNetworkLatency();

    console.log('\n📊 测试结果统计:');
    console.log(`✅ 成功: ${this.successCount}`);
    console.log(`❌ 失败: ${this.failureCount}`);
    console.log(`⏰ 超时: ${this.timeoutCount}`);
    console.log(`📊 成功率: ${((this.successCount / (this.successCount + this.failureCount)) * 100).toFixed(1)}%`);
  }
}

// 运行测试
const tester = new HTTPReliabilityTester();
tester.runAllTests();