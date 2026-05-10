# Aegis Hermes Plugin Hook

通过 Hermes Plugin Hook 系统拦截 AI Agent 的命令执行，与 Aegis 安全监控后端集成。

## 安装

### 方式一：通过 aegis setup 自动安装

```bash
npm install -g ai-aegis
aegis setup
# 提示：是否配置 Claude Code Hook 自动拦截？ → y
# 提示：是否配置 Hermes Plugin Hook 自动拦截？ → y
```

### 方式二：手动安装

1. 创建插件目录：
   ```bash
   mkdir -p ~/.hermes/plugins/aegis
   ```

2. 复制 plugin.py：
   ```bash
   cp hooks/hermes/plugin.py ~/.hermes/plugins/aegis/
   ```

3. 重启 Hermes CLI 生效

## 工作原理

```
Hermes CLI 发送命令 → pre_tool_call 拦截 → Aegis 后端评估 → 决策执行
                                          ↓
                                    allow → 放行
                                    warn  → 记录放行
                                    block → 拒绝（返回 {"action": "block"}）
                                    review → 创建审批 → 长轮询 60s → 放行/拒绝
```

## 字段对齐

| Aegis 字段 | Hermes 来源 |
|-----------|------------|
| command | args["command"] |
| sessionId | task_id |
| cwd | os.getcwd() |
| agentType | "hermes" |
| model | pre_llm_call 缓存 |
| taskId | task_id |
| userInput | pre_llm_call 缓存 |
| requestId | Hook 生成 |

## 兼容性

- **后端零修改**：只改 Hook 脚本，不改 Aegis 后端任何代码
- **零额外依赖**：使用 Python 标准库 urllib，无需 pip 安装
- **降级安全**：后端不可用时默认放行，不阻塞工作流

## 测试

```bash
# 测试脚本语法
python3 -m py_compile ~/.hermes/plugins/aegis/plugin.py

# 测试拦截逻辑（需 Aegis 后端运行）
python3 ~/.hermes/plugins/aegis/plugin.py
```
