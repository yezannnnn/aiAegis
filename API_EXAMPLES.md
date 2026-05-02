# Aegis 真实拦截数据 API 示例

## ✅ 更新说明
- Session ID 和 Intent **必须来自真实拦截数据**，不再模拟生成
- 所有拦截事件应由 Agent CLI 主动发送

## 📋 API接口: `/api/intercept`

### 请求格式
```bash
POST http://localhost:3001/api/intercept
Content-Type: application/json
```

### 数据结构 (从 Agent CLI 发送)
```json
{
  "command": "rm -rf /Users/important",
  "agent": "hermes",
  "risk": "CRITICAL",
  "status": "blocked",
  "sessionId": "hermes-session-20260501-001", // 真实session ID
  "userContext": {
    "user": "developer",
    "project": "webapp",
    "workingDir": "/Users/developer/webapp",
    "timestamp": "2026-05-01T22:45:30Z"
  },
  "intent": "cleanup_temp_files", // 真实解析的意图
  "metadata": {
    "riskScore": 95,
    "alternatives": ["rm -rf /tmp", "find /Users/important -name '*.tmp' -delete"],
    "source": "user_command"
  }
}
```

## 🔥 Hermes CLI 示例
```json
{
  "command": "sudo chmod 777 /etc/passwd",
  "agent": "hermes",
  "risk": "CRITICAL",
  "status": "blocked",
  "sessionId": "hermes-20260501-143052",
  "userContext": {
    "user": "admin",
    "project": "system-config",
    "workingDir": "/etc",
    "shell": "zsh"
  },
  "intent": "modify_system_permissions"
}
```

## 🔧 OpenClaw CLI 示例
```json
{
  "command": "git push --force origin main",
  "agent": "openClaw",
  "risk": "HIGH",
  "status": "warning",
  "sessionId": "openclaw-git-session-001",
  "userContext": {
    "user": "developer",
    "project": "api-server",
    "branch": "main",
    "commitCount": 5
  },
  "intent": "force_push_to_main"
}
```

## 🤖 Claude Code CLI 示例
```json
{
  "command": "npm install --unsafe-perm",
  "agent": "claude-code",
  "risk": "MEDIUM",
  "status": "allowed",
  "sessionId": "claude-code-npm-20260501",
  "userContext": {
    "user": "developer",
    "project": "frontend",
    "packageManager": "npm",
    "nodeVersion": "20.x"
  },
  "intent": "install_package_dependencies"
}
```

## 💻 GitHub Codex CLI 示例
```json
{
  "command": "docker run --privileged -v /:/host ubuntu",
  "agent": "codex",
  "risk": "HIGH",
  "status": "blocked",
  "sessionId": "codex-docker-20260501",
  "userContext": {
    "user": "devops",
    "project": "containerization",
    "dockerVersion": "24.0.7"
  },
  "intent": "create_privileged_container"
}
```

## 📊 Session 管理 API: `/api/session`

### 更新会话信息
```json
POST http://localhost:3001/api/session

{
  "sessionId": "hermes-20260501-143052",
  "user": "developer",
  "project": "webapp",
  "startTime": "2026-05-01T14:30:52Z",
  "lastActivity": "2026-05-01T14:35:22Z",
  "commandCount": 15,
  "riskEvents": 3
}
```

## 🧪 测试连接: `/api/simulate`
```bash
POST http://localhost:3001/api/simulate
# 返回连接状态，不生成模拟数据
```

## ⚡ 实时特性

### WebSocket 连接
- **地址**: `ws://localhost:3002`
- **事件**: 实时接收拦截事件、session更新、agent状态

### 监控界面
- **地址**: http://localhost:3001
- **特性**: Dark Minimal UI + 实时多Agent显示

---

## 🚀 Agent CLI 集成建议

1. **会话管理**: 每个CLI维护独特的sessionId
2. **意图解析**: 使用AI分析用户命令的真实意图
3. **风险评估**: 基于命令内容和上下文计算风险等级
4. **实时发送**: 拦截发生时立即POST到 `/api/intercept`

这样，监控界面将显示真实的Agent活动，而不是模拟数据！