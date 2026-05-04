# Hermes Event Hooks 官方文档记录

> 来源: https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks
> 记录时间: 2026-05-03
> 用途: Aegis v2 集成参考

---

## 三种 Hook 系统对比

| 系统 | 注册方式 | 运行环境 | 用途 |
|------|---------|---------|------|
| Gateway hooks | `~/.hermes/hooks/` 下的 `HOOK.yaml` + `handler.py` | Gateway only | 日志、告警、Webhook |
| Plugin hooks | Plugin 内 `ctx.register_hook()` | CLI + Gateway | 工具拦截、指标、护栏 |
| Shell hooks | `~/.hermes/config.yaml` 的 `hooks:` 块指向 shell 脚本 | CLI + Gateway | 即插即用脚本，用于阻塞、格式化、上下文注入 |

**关键特性**: 所有三种系统都是非阻塞的 —— hook 中的错误会被捕获并记录，不会导致 agent 崩溃。

---

## 一、Gateway Event Hooks（仅 Gateway）

### 目录结构
```
~/.hermes/hooks/
└── my-hook/
    ├── HOOK.yaml      # 声明监听的事件
    └── handler.py     # Python handler 函数
```

### HOOK.yaml 示例
```yaml
name: my-hook
description: Log all agent activity to a file
events:
  - agent:start
  - agent:end
  - agent:step
```

### handler.py 示例
```python
import json
from datetime import datetime
from pathlib import Path

LOG_FILE = Path.home() / ".hermes" / "hooks" / "my-hook" / "activity.log"

async def handle(event_type: str, context: dict):
    """Called for each subscribed event. Must be named 'handle'."""
    entry = {
        "timestamp": datetime.now().isoformat(),
        "event": event_type,
        **context,
    }
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
```

**Handler 规则**:
- 必须命名为 `handle`
- 接收 `event_type` (string) 和 `context` (dict)
- 可以是 `async def` 或普通 `def`
- 错误被捕获，不会 crash agent

### 可用事件

| 事件 | 触发时机 | Context keys |
|------|---------|-------------|
| `gateway:startup` | Gateway 进程启动 | `platforms` (活跃平台列表) |
| `session:start` | 新消息会话创建 | `platform`, `user_id`, `session_id`, `session_key` |
| `session:end` | 会话结束（重置前） | `platform`, `user_id`, `session_key` |
| `session:reset` | 用户执行 /new 或 /reset | `platform`, `user_id`, `session_key` |
| `agent:start` | Agent 开始处理消息 | `platform`, `user_id`, `session_id`, `message` |
| `agent:step` | 工具调用循环的每次迭代 | `platform`, `user_id`, `session_id`, `iteration`, `tool_names` |
| `agent:end` | Agent 完成处理 | `platform`, `user_id`, `session_id`, `message`, `response` |
| `command:*` | 任何 slash 命令执行 | `platform`, `user_id`, `command`, `args` |

**通配符**: `command:*` 匹配所有 `command:` 事件。

---

## 二、Plugin Hooks（CLI + Gateway）

在 plugin 的 `register()` 函数中通过 `ctx.register_hook()` 注册。

```python
def register(ctx):
    ctx.register_hook("pre_tool_call", my_tool_observer)
    ctx.register_hook("post_tool_call", my_tool_logger)
    ctx.register_hook("pre_llm_call", my_memory_callback)
    ctx.register_hook("post_llm_call", my_sync_callback)
    ctx.register_hook("on_session_start", my_init_callback)
    ctx.register_hook("on_session_end", my_cleanup_callback)
```

### 通用规则
- Callbacks 接收 keyword arguments，**必须接受 `**kwargs`** 以保持向前兼容
- Callback 崩溃会被记录并跳过，不影响 agent
- **两个 hook 的返回值会影响行为**:
  - `pre_tool_call` 可以阻塞工具调用
  - `pre_llm_call` 可以向 LLM 调用注入上下文
- 其他 hook 都是 fire-and-forget 观察者

### Hook 速查表

| Hook | 触发时机 | 返回值 |
|------|---------|--------|
| `pre_tool_call` | 任何工具执行前 | `{"action": "block", "message": str}` 否决调用 |
| `post_tool_call` | 任何工具返回后 | 忽略 |
| `pre_llm_call` | 每轮一次，工具调用循环前 | `{"context": str}` 向用户消息前追加上下文 |
| `post_llm_call` | 每轮一次，工具调用循环后 | 忽略 |
| `on_session_start` | 新会话创建（仅首轮） | 忽略 |
| `on_session_end` | 会话结束 | 忽略 |
| `on_session_finalize` | CLI/Gateway 拆除活跃会话 | 忽略 |
| `on_session_reset` | Gateway 切换新 session key | 忽略 |
| `subagent_stop` | `delegate_task` 子 agent 退出 | 忽略 |
| `pre_gateway_dispatch` | Gateway 收到用户消息后，auth + dispatch 前 | `{"action": "skip"\|"rewrite"\|"allow", ...}` |
| `pre_approval_request` | 危险命令需要用户审批前 | 忽略 |
| `post_approval_response` | 用户响应审批提示后 | 忽略 |
| `transform_tool_result` | 工具返回后，交给模型前 | `str` 替换结果，`None` 不变 |
| `transform_terminal_output` | terminal 工具内，截断/ANSI-strip/redact 前 | `str` 替换输出，`None` 不变 |

---

## 三、Shell Hooks（CLI + Gateway）

在 `~/.hermes/config.yaml` 中声明，无需编写 Python plugin。

### 配置 Schema
```yaml
hooks:
  <event_name>:                  # 必须在 VALID_HOOKS 中
    - matcher: "<regex>"         # 可选；仅用于 pre/post_tool_call
      command: "<shell command>" # 必需；通过 shlex.split 执行，shell=False
      timeout: <seconds>         # 可选；默认 60，上限 300

hooks_auto_accept: false         # 同意模型，见下文
```

### JSON 通信协议

**stdin —— script 接收的 payload**:
```json
{
  "hook_event_name": "pre_tool_call",
  "tool_name":       "terminal",
  "tool_input":      {"command": "rm -rf /"},
  "session_id":      "sess_abc123",
  "cwd":             "/home/user/project",
  "extra":           {"task_id": "...", "tool_call_id": "..."}
}
```

**stdout —— 可选响应**:
```json
// 阻塞 pre_tool_call（两种格式都接受，内部会规范化）:
{"decision": "block", "reason":  "Forbidden: rm -rf"}   // Claude-Code 风格
{"action":   "block", "message": "Forbidden: rm -rf"}   // Hermes 规范

// 为 pre_llm_call 注入上下文:
{"context": "Today is Friday, 2026-04-17"}

// 静默无操作 —— 任何空/不匹配输出都可以:
```

### 示例

**1. 每次 write_file 后自动格式化 Python 文件**:
```yaml
hooks:
  post_tool_call:
    - matcher: "write_file|patch"
      command: "~/.hermes/agent-hooks/auto-format.sh"
```

```bash
#!/usr/bin/env bash
payload="$(cat -)"
path=$(echo "$payload" | jq -r '.tool_input.path // empty')
[[ "$path" == *.py ]] && command -v black >/dev/null && black "$path" 2>/dev/null
printf '{}\n'
```

**2. 阻塞破坏性 terminal 命令**:
```yaml
hooks:
  pre_tool_call:
    - matcher: "terminal"
      command: "~/.hermes/agent-hooks/block-rm-rf.sh"
      timeout: 5
```

```bash
#!/usr/bin/env bash
payload="$(cat -)"
cmd=$(echo "$payload" | jq -r '.tool_input.command // empty')
if echo "$cmd" | grep -qE 'rm[[:space:]]+-rf?[[:space:]]+/'; then
  printf '{"decision": "block", "reason": "blocked: rm -rf / is not permitted"}\n'
else
  printf '{}\n'
fi
```

**3. 每轮注入 git status（Claude-Code UserPromptSubmit 等价物）**:
```yaml
hooks:
  pre_llm_call:
    - command: "~/.hermes/agent-hooks/inject-cwd-context.sh"
```

```bash
#!/usr/bin/env bash
cat - >/dev/null   # 丢弃 stdin payload
if status=$(git status --porcelain 2>/dev/null) && [[ -n "$status" ]]; then
  jq --null-input --arg s "$status" \
     '{context: ("Uncommitted changes in cwd:\n" + $s)}'
else
  printf '{}\n'
fi
```

### 同意模型（Consent Model）

每个唯一的 `(event, command)` 对在首次遇到时会提示用户批准，然后持久化到 `~/.hermes/shell-hooks-allowlist.json`。

三种绕过方式（满足任一即可）:
1. CLI 添加 `--accept-hooks` 标志（如 `hermes --accept-hooks chat`）
2. 设置环境变量 `HERMES_ACCEPT_HOOKS=1`
3. 在 `cli-config.yaml` 中设置 `hooks_auto_accept: true`

**非 TTY 运行**（gateway、cron、CI）需要上述三种方式之一，否则新 hook 会静默保持未注册状态并记录警告。

脚本编辑被静默信任。allowlist 基于精确的 command 字符串而非脚本 hash。

### hermes hooks CLI

| 命令 | 作用 |
|------|------|
| `hermes hooks list` | 导出配置的 hooks，含 matcher、timeout、同意状态 |
| `hermes hooks test <event> [--for-tool X] [--payload-file F]` | 对合成 payload 触发所有匹配的 hook 并打印响应 |
| `hermes hooks revoke <command>` | 移除所有匹配 `<command>` 的 allowlist 条目 |
| `hermes hooks doctor` | 检查每个 hook：exec 位、allowlist 状态、mtime 漂移、JSON 输出有效性、大致执行时间 |

---

## 四、三种 Hook 系统对比

| 维度 | Shell hooks | Plugin hooks | Gateway hooks |
|------|------------|-------------|---------------|
| 声明位置 | `hooks:` block in `~/.hermes/config.yaml` | `register()` in plugin | `HOOK.yaml` + `handler.py` directory |
| 存放路径 | `~/.hermes/agent-hooks/` (约定) | `~/.hermes/plugins/<name>/` | `~/.hermes/hooks/<name>/` |
| 语言 | 任意 (Bash, Python, Go binary, ...) | 仅 Python | 仅 Python |
| 运行环境 | CLI + Gateway | CLI + Gateway | Gateway only |
| 事件 | VALID_HOOKS (含 subagent_stop) | VALID_HOOKS | Gateway 生命周期 |
| 能否阻塞工具调用 | Yes (pre_tool_call) | Yes (pre_tool_call) | No |
| 能否注入 LLM 上下文 | Yes (pre_llm_call) | Yes (pre_llm_call) | No |
| 同意模型 | 首次使用提示 | 隐式 (Python plugin 信任) | 隐式 (目录信任) |
| 进程隔离 | Yes (subprocess) | No (in-process) | No (in-process) |

---

## 五、对 Aegis v2 的启示

### 1. pre_tool_call —— 核心拦截点

这是 Aegis 安全拦截器的**最佳集成点**:
- 在每次工具执行前触发
- 可以返回 `{"action": "block", "message": "..."}` 否决工具调用
- 支持 Python plugin 和 Shell hook 两种形式
- **Python plugin 优先**（注册顺序上 Python 先于 Shell）

### 2. pre_llm_call —— 上下文注入

可用于:
- 向 LLM 注入安全策略提示
- 注入审批状态信息
- 注入当前会话的安全上下文

### 3. post_tool_call —— 审计日志

可用于:
- 记录所有工具调用用于审计
- 收集工具使用指标
- 检测异常工具调用模式

### 4. pre_approval_request / post_approval_response

可用于:
- 自定义审批通知（如发送到外部系统）
- 记录审批决策
- 与 Aegis 审批系统联动

### 5. transform_tool_result —— 结果审查

可用于:
- 审查工具返回结果中的敏感信息
- 对结果进行脱敏处理
- 注入额外的安全提示

---

## 六、关键发现

1. **Hermes 的 `pre_tool_call` 与 Claude Code 的 `preToolUseHook` 等价** —— 都是工具执行前的拦截点
2. **Hermes 的 `pre_llm_call` 与 Claude Code 的 `UserPromptSubmit` 等价** —— 都是向 LLM 注入上下文
3. **Gateway hooks 仅适用于 Gateway 环境** —— CLI 模式下不加载
4. **Plugin hooks 同时适用于 CLI 和 Gateway** —— 是 Aegis 的首选集成方式
5. **Shell hooks 提供进程隔离** —— 适合不信任的第三方脚本，但 Python plugin 性能更好
6. **所有 hook 都是非阻塞的** —— 错误不会 crash agent，但这也意味着 Aegis 拦截失败时 agent 会继续运行

---

## 七、Aegis 集成建议

基于以上分析，Aegis v2 的 Hermes 集成方案:

1. **主要使用 Plugin hooks**（`pre_tool_call`）实现工具调用拦截
2. **辅以 `pre_llm_call`** 注入安全策略上下文
3. **使用 `post_tool_call`** 记录审计日志
4. **考虑 Shell hooks** 作为用户自定义规则的扩展点
5. **注意**: Gateway hooks 不能用于 CLI 模式的安全拦截

> 记录完毕。此文档用于后续 Aegis v2 与 Hermes 集成的技术决策参考。
