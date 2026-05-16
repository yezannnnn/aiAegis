#!/usr/bin/env node

const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 启动浏览器测试');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 监听控制台消息
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('WebSocket') || text.includes('连接') || text.includes('Pinia')) {
      console.log('📱 浏览器控制台:', text);
    }
  });

  // 监听错误
  page.on('pageerror', error => {
    console.error('❌ 页面错误:', error.message);
  });

  try {
    console.log('🌍 访问规则页面');
    await page.goto('http://localhost:3001/rules', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // 等待页面加载
    await page.waitForTimeout(3000);

    // 检查 connection-status 元素
    const connectionElements = await page.$$('.connection-status');
    console.log('🔍 找到连接状态元素数量:', connectionElements.length);

    if (connectionElements.length > 0) {
      // 获取连接状态文本
      const connectionText = await page.evaluate(() => {
        const element = document.querySelector('.connection-status');
        return element ? {
          text: element.textContent.trim(),
          class: element.className,
          visible: window.getComputedStyle(element).display !== 'none'
        } : null;
      });

      console.log('📊 连接状态信息:', connectionText);

      // 检查 WebSocket store 状态
      const storeState = await page.evaluate(() => {
        // 尝试获取 Vue 应用实例和 store
        const app = document.querySelector('#app').__vueParentComponent;
        if (app) {
          return {
            hasApp: true,
            // 这里可能需要调整以匹配实际的 store 结构
            storeExists: !!window.__PINIA__
          };
        }
        return { hasApp: false };
      });

      console.log('🏪 Store状态:', storeState);
    }

    // 检查是否有 JavaScript 错误
    const errors = await page.evaluate(() => {
      return window.__vueErrors || [];
    });

    if (errors.length > 0) {
      console.error('🐛 Vue 错误:', errors);
    } else {
      console.log('✅ 无 Vue 错误');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }

  await browser.close();
  console.log('🏁 测试完成');
})();