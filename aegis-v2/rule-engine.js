#!/usr/bin/env node

/**
 * Aegis Rule Engine - 基于YAML配置的命令规则引擎
 * 类似ESLint的规则系统
 */

const fs = require('fs');
const path = require('path');

class AegisRuleEngine {
  constructor(configPath) {
    this.configPath = configPath || path.join(__dirname, 'aegis-rules.yaml');
    this.rules = null;
    this.options = {};
    this.loadRules();
  }

  /**
   * 🔄 加载YAML配置文件
   */
  loadRules() {
    try {
      if (!fs.existsSync(this.configPath)) {
        console.error(`[Aegis] 规则文件不存在: ${this.configPath}`);
        this.useDefaultRules();
        return;
      }

      const yamlContent = fs.readFileSync(this.configPath, 'utf8');
      const config = this.parseYAML(yamlContent);

      this.rules = config.rules || {};
      this.options = config.options || {};
      this.defaultAction = config.default || { action: 'allow', reason: '默认允许' };

      // 输出到stderr避免污染JSON
      process.stderr.write(`[Aegis] 规则配置已加载: ${Object.keys(this.rules).length} 个分类\n`);
    } catch (error) {
      console.error(`[Aegis] 加载规则失败: ${error.message}`);
      this.useDefaultRules();
    }
  }

  /**
   * 📋 简单的YAML解析器 (生产环境建议使用js-yaml)
   */
  parseYAML(content) {
    const config = { rules: {}, options: {}, default: {} };
    const lines = content.split('\n');
    let currentSection = null;
    let currentCategory = null;

    for (let line of lines) {
      line = line.trim();

      // 跳过注释和空行
      if (!line || line.startsWith('#')) continue;

      // 主要部分
      if (line === 'rules:') {
        currentSection = 'rules';
        continue;
      } else if (line === 'options:') {
        currentSection = 'options';
        continue;
      } else if (line === 'default:') {
        currentSection = 'default';
        continue;
      }

      if (currentSection === 'rules') {
        // 规则分类
        if (line.endsWith(':') && !line.includes('pattern')) {
          currentCategory = line.replace(':', '');
          config.rules[currentCategory] = [];
        }
        // 规则项
        else if (line.includes('pattern:')) {
          const pattern = line.match(/pattern:\s*"(.+)"/)?.[1];
          if (pattern) {
            const rule = { pattern };
            config.rules[currentCategory] = config.rules[currentCategory] || [];
            config.rules[currentCategory].push(rule);
          }
        }
        else if (line.includes('action:')) {
          const action = line.match(/action:\s*(\w+)/)?.[1];
          if (action && config.rules[currentCategory]?.length > 0) {
            const lastRule = config.rules[currentCategory][config.rules[currentCategory].length - 1];
            lastRule.action = action;
          }
        }
        else if (line.includes('reason:')) {
          const reason = line.match(/reason:\s*"(.+)"/)?.[1];
          if (reason && config.rules[currentCategory]?.length > 0) {
            const lastRule = config.rules[currentCategory][config.rules[currentCategory].length - 1];
            lastRule.reason = reason;
          }
        }
      } else if (currentSection === 'options') {
        const match = line.match(/(\w+):\s*(.+)/);
        if (match) {
          const [, key, value] = match;
          config.options[key] = isNaN(value) ? value : Number(value);
        }
      } else if (currentSection === 'default') {
        const match = line.match(/(\w+):\s*(.+)/);
        if (match) {
          const [, key, value] = match;
          config.default[key] = value.replace(/"/g, '');
        }
      }
    }

    return config;
  }

  /**
   * 🔍 检查命令是否匹配规则
   */
  checkCommand(command) {
    // 遍历所有规则分类
    for (const [category, rules] of Object.entries(this.rules)) {
      for (const rule of rules) {
        if (this.matchPattern(command, rule.pattern)) {
          return {
            matched: true,
            category,
            action: rule.action,
            reason: rule.reason,
            pattern: rule.pattern
          };
        }
      }
    }

    // 没有匹配的规则，返回默认操作
    return {
      matched: false,
      action: this.defaultAction.action,
      reason: this.defaultAction.reason
    };
  }

  /**
   * 🎯 模式匹配函数
   */
  matchPattern(command, pattern) {
    try {
      // 转换简单的glob模式为正则表达式
      const regexPattern = pattern
        .replace(/\*/g, '.*')           // * → .*
        .replace(/\?/g, '.')            // ? → .
        .replace(/\|/g, '|')            // 保持或操作
        .replace(/\(/g, '(?:')          // 非捕获组
        .replace(/\s+/g, '\\s+');       // 空格处理

      const regex = new RegExp(regexPattern, 'i'); // 不区分大小写
      return regex.test(command);
    } catch (error) {
      console.error(`[Aegis] 模式匹配错误: ${pattern} - ${error.message}`);
      return false;
    }
  }

  /**
   * 🔒 使用默认规则（配置加载失败时）
   */
  useDefaultRules() {
    this.rules = {
      dangerous: [
        { pattern: 'rm -rf /', action: 'deny', reason: '删除根目录，禁止执行' },
        { pattern: 'rm -rf .*', action: 'review', reason: '递归删除，需要确认' },
        { pattern: 'sudo rm .*', action: 'review', reason: 'sudo删除，需要确认' }
      ],
      safe: [
        { pattern: 'ls .*', action: 'allow', reason: '列出文件，安全操作' },
        { pattern: 'pwd', action: 'allow', reason: '显示路径，安全操作' },
        { pattern: 'date', action: 'allow', reason: '显示日期，安全操作' }
      ]
    };
    this.defaultAction = { action: 'allow', reason: '默认允许' };
    this.options = { review_timeout: 30 };
  }

  /**
   * 📊 获取规则统计信息
   */
  getRuleStats() {
    const stats = { total: 0, categories: {} };

    for (const [category, rules] of Object.entries(this.rules)) {
      stats.categories[category] = {
        count: rules.length,
        actions: {}
      };

      for (const rule of rules) {
        stats.total++;
        stats.categories[category].actions[rule.action] =
          (stats.categories[category].actions[rule.action] || 0) + 1;
      }
    }

    return stats;
  }
}

module.exports = AegisRuleEngine;

// CLI测试
if (require.main === module) {
  const engine = new AegisRuleEngine();

  // 测试命令
  const testCommands = [
    'rm -rf /important-files',
    'ls -la',
    'sudo rm test.txt',
    'npm install express',
    'curl https://example.com',
    'git commit -m "test"'
  ];

  console.log('\n🧪 规则引擎测试\n');

  for (const command of testCommands) {
    const result = engine.checkCommand(command);
    console.log(`📋 Command: ${command}`);
    console.log(`🎯 Action: ${result.action.toUpperCase()}`);
    console.log(`📝 Reason: ${result.reason}`);
    if (result.matched) {
      console.log(`🏷️ Category: ${result.category}`);
      console.log(`🔍 Pattern: ${result.pattern}`);
    }
    console.log('━'.repeat(50));
  }

  console.log('\n📊 规则统计:');
  console.log(engine.getRuleStats());
}