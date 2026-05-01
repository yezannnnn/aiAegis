# 🔗 Claude Code Hook集成方案

## 🎯 集成目标

让Aegis通过Hook方式拦截Claude Code执行的高危命令，包括：
- Git操作、文件删除、数据库操作等
- 提供实时审批和安全建议
- 深度上下文分析和智能决策

## 🔍 Claude Code Hook架构

### 当前Hook架构
```
Claude Code → claude-hook-interactive.js → Monitor(3001端口) → 用户决策
           (stdin pipe)                  (HTTP POST)
```

### Hook拦截流程
1. **命令捕获**: Claude Code执行命令时，通过stdin pipe发送给hook
2. **上下文分析**: hook获取Claude Code会话信息和项目上下文
3. **风险评估**: AST语义分析 + 规则引擎评估风险级别
4. **人工决策**: 监控界面显示详情，用户批准/拒绝
5. **执行控制**: 根据决策允许或阻止命令执行

## 🚀 Hook集成方案

### 核心组件

**1. Hook处理器**
```javascript
// claude-hook-interactive.js
#!/usr/bin/env node
const claudeContext = require('./src/context/claude-context.js');

// 从stdin接收命令
process.stdin.on('data', async (command) => {
  // 1. AST解析命令
  const ast = parseCommand(command);

  // 2. 获取Claude上下文
  const context = await claudeContext.getCurrentSession();

  // 3. 风险评估
  const risk = assessRisk(ast, context);

  // 4. 发送到监控界面
  const decision = await sendToMonitor({
    command, ast, context, risk
  });

  // 5. 返回决策结果
  process.exit(decision.approved ? 0 : 1);
});
```

**2. 监控界面**
```javascript
// slock-style-monitor.js (端口3001)
// Cyberpunk风格的实时监控界面
// - 命令流显示
// - 风险分析
// - 上下文信息
// - 决策按钮
```

**3. 上下文分析器**
```javascript
// src/context/claude-context.js
// - Claude Code会话检测
// - AI模型识别
// - 项目环境分析
// - 用户输入历史
```

## 💻 使用方法

### 1. 启动监控服务
```bash
# 启动监控界面
node ~/Desktop/yezannnnn/aiGroup/shared/skills/security-monitor/slock-style-monitor.js

# 访问监控界面
open http://localhost:3001
```

### 2. 测试Hook功能
```bash
# 测试安全命令
echo "ls -la" | /Users/yuhao/.aegis/claude-hook-interactive.js

# 测试危险命令
echo "rm -rf /tmp/test" | /Users/yuhao/.aegis/claude-hook-interactive.js
```

### 3. Claude Code集成
Claude Code在执行Bash工具时，命令会自动通过hook进行检查。

## 🎯 Hook特性

### 深度上下文分析
- ✅ **会话信息**: 当前Claude Code会话ID和项目信息
- ✅ **AI模型检测**: 自动识别Claude/Hermes/GPT等模型
- ✅ **用户意图**: 分析用户输入和命令意图的关联
- ✅ **环境感知**: 检测当前项目类型、Git状态等

### 智能风险评估
- ✅ **AST语义分析**: 精确解析命令结构而非简单匹配
- ✅ **上下文相关**: 根据项目环境调整风险级别
- ✅ **学习能力**: 基于历史决策优化风险判断

### 实时监控界面
- ✅ **Cyberpunk风格**: Matrix绿色主题的终端风格界面
- ✅ **实时数据流**: WebSocket实时显示命令和决策
- ✅ **详细分析**: 完整的命令上下文和风险分析
- ✅ **一键决策**: 直观的批准/拒绝按钮

## 🔧 配置选项

### Hook配置
```javascript
// /Users/yuhao/.aegis/config.json
{
  "hook": {
    "enabled": true,
    "timeout": 30,
    "default_action": "block"
  },
  "monitor": {
    "port": 3001,
    "style": "cyberpunk"
  }
}
```

### AI模型支持
```javascript
// 支持的AI模型检测
const AI_MODEL_TYPES = {
  'claude': { name: 'Claude', provider: 'Anthropic' },
  'hermes': { name: 'Hermes', provider: 'Meta/Nous Research' },
  'gpt': { name: 'GPT', provider: 'OpenAI' },
  'gemini': { name: 'Gemini', provider: 'Google' }
};
```

## 📊 监控统计

Hook方式提供详细的统计信息：
- 命令执行次数
- 风险级别分布
- AI模型活动状态
- 决策准确率

## 🔧 故障排除

### 检查Hook状态
```bash
# 测试Hook是否正常
echo "pwd" | /Users/yuhao/.aegis/claude-hook-interactive.js

# 检查监控服务
curl http://localhost:3001/health
```

### Debug模式
```bash
# 启用详细日志
export AEGIS_DEBUG=1
```

---

**🎯 Hook集成优势**:
- 🔍 **深度分析**: 完整的Claude Code上下文信息
- ⚡ **响应迅速**: 直接的stdin/stdout通信
- 🎨 **可视化**: 丰富的监控界面
- 🧠 **智能化**: AI模型感知的风险评估