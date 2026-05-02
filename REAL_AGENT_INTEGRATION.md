# 🚫 真实Agent CLI集成指南

## ⚠️ 重要说明
**当前监控系统已完全清理，不包含任何模拟或测试数据！**

访问 http://localhost:3001 会显示：
- ❌ 暂无活跃代理
- ❌ 暂无活跃会话
- ❌ 等待拦截事件...

**这是正确状态！**

---

## 🔧 需要集成的Agent CLI

### 1. Hermes CLI 集成
```bash
# 在Hermes CLI中添加拦截钩子
curl -X POST http://localhost:3001/api/intercept \
  -H "Content-Type: application/json" \
  -d "{
    \"command\": \"$INTERCEPTED_COMMAND\",
    \"agent\": \"hermes\",
    \"risk\": \"$RISK_LEVEL\",
    \"status\": \"$ACTION_RESULT\",
    \"sessionId\": \"$HERMES_SESSION_ID\",
    \"userContext\": {
      \"user\": \"$USERNAME\",
      \"project\": \"$PROJECT_NAME\",
      \"workingDir\": \"$PWD\"
    },
    \"intent\": \"$PARSED_INTENT\"
  }"
```

### 2. Claude Code CLI 集成
```bash
# 在Claude Code中添加危险操作检测
curl -X POST http://localhost:3001/api/intercept \
  -H "Content-Type: application/json" \
  -d "{
    \"command\": \"$COMMAND\",
    \"agent\": \"claude-code\",
    \"risk\": \"$CALCULATED_RISK\",
    \"status\": \"$DECISION\",
    \"sessionId\": \"$CLAUDE_SESSION\",
    \"userContext\": {
      \"user\": \"$USER\",
      \"project\": \"$PROJECT_PATH\"
    },
    \"intent\": \"$AI_PARSED_INTENT\"
  }"
```

### 3. OpenClaw CLI 集成
```bash
# 在OpenClaw工具执行前
curl -X POST http://localhost:3001/api/intercept \
  -H "Content-Type: application/json" \
  -d "{
    \"command\": \"$TOOL_COMMAND\",
    \"agent\": \"openClaw\",
    \"sessionId\": \"$OPENCLAW_SESSION\",
    \"intent\": \"$TOOL_PURPOSE\"
  }"
```

### 4. GitHub Codex CLI 集成
```bash
# 在Codex生成代码执行前
curl -X POST http://localhost:3001/api/intercept \
  -H "Content-Type: application/json" \
  -d "{
    \"command\": \"$GENERATED_COMMAND\",
    \"agent\": \"codex\",
    \"sessionId\": \"$CODEX_SESSION\",
    \"intent\": \"$CODE_PURPOSE\"
  }"
```

---

## 🎯 数据字段说明

### 必需字段
- `command` - 被拦截的实际命令
- `agent` - 发送拦截的CLI名称 (hermes/claude-code/openClaw/codex)
- `sessionId` - 真实的会话ID (由各CLI生成)
- `intent` - 真实解析的用户意图

### 可选字段
- `risk` - 风险等级 (LOW/MEDIUM/HIGH/CRITICAL)
- `status` - 处理状态 (allowed/blocked/warning/pending)
- `userContext` - 用户上下文信息

---

## 🚀 集成检查清单

### ✅ 集成完成后应该看到：
1. **活跃代理面板** - 显示真正连接的CLI
2. **会话信息** - 显示真实的用户会话
3. **拦截事件** - 显示真实的命令拦截
4. **实时统计** - 基于真实拦截的数量

### ❌ 不应该看到：
- 任何预设/模拟数据
- 固定的测试命令
- 虚假的session ID
- 硬编码的intent

---

## 🔍 验证方法

1. **启动任一Agent CLI**
2. **执行可能有风险的命令**
3. **检查监控界面是否显示该事件**
4. **确认session和intent来自真实解析**

---

**现在系统完全干净，等待真实Agent CLI集成！**