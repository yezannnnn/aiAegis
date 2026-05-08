<div align="center">

# 🛡️ Aegis

### AI Agent 高危命令拦截器 — 给 agent Cli 的最后一道防线

[![npm](https://img.shields.io/npm/v/ai-aegis.svg)](https://www.npmjs.com/package/ai-aegis)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/yezannnnn/aiAegis)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with NestJS](https://img.shields.io/badge/backend-NestJS-e0234e.svg)](https://nestjs.com/)
[![Built with Vue 3](https://img.shields.io/badge/frontend-Vue%203-4fc08d.svg)](https://vuejs.org/)

</div>

## Why Aegis?

AI Agent（Claude Code、Hermes、Codex）是个黑盒子。你给它一个任务，它会自主执行一系列命令 — 大多数时候没问题，但偶尔它会做出你根本没想到的操作：

```bash
rm -rf /                    # 删库跑路
git push --force origin main   # 覆盖同事代码
chmod -R 777 /etc              # 打开系统全部权限
cat .env | pbcopy              # 泄露密钥到剪贴板
npx prisma migrate reset       # 清空生产数据库
```

**你不应该用"祈祷"来保证安全。**

**Aegis 是最后一道防线。** 它在命令真正执行之前介入 — AST 解析命令结构，11 条规则集覆盖 100+ 条规则判定风险等级，高危操作在监控界面弹出审批请求。你说允许才放行，你说拒绝就终止。

```
AI Agent 发出命令 → PreToolUse Hook 拦截 → AST 规则引擎判定 → 监控界面审批 → 执行或终止
```

- **不是事后日志** — 命令发出之前就拦下来
- **不是全局开关** — 分三级（block 直接拒绝 / review 需审批 / warn 仅记录），精细控制
- **不依赖 AI 自觉** — 系统层面强制介入，绕过不了

![Aegis 拦截演示](./docs/images/index.gif)

---

## Features

### 🧠 AST 规则引擎

- **结构化命令解析** — 将 bash 命令解析为 AST（binary + subcommands + flags + arguments），精准匹配而非正则猜测
- **11 个内置规则集** — 覆盖 filesystem、git、docker、mysql、prisma、network、development、sqlite、defaults 等常见风险场景
- **三级风险判定** — `block` 直接拒绝不可绕过 / `review` 弹窗审批 / `warn` 仅记录放行
- **上下文感知** — git 命令自动检测当前分支（main/master vs 其他），同一规则不同策略

### 🖥️ 实时监控面板

- **Web Dashboard** — `http://localhost:3001` 打开即用，实时展示所有拦截事件
- **审批中心** — 高危命令弹出审批窗口，一键允许/拒绝，60 秒超时自动拒绝
- **事件流** — 按时间线展示所有命令评估记录，可追溯每条命令的决策过程
- **统计面板** — 拦截次数、审批通过/拒绝比例、规则触发频率可视化

### 📝 自定义规则系统

- **YAML 声明式配置** — 无需写代码，YAML 文件定义规则
- **多种匹配方式** — 命令名匹配 / 子命令匹配 / Flag 匹配 / 参数正则匹配 / 完整命令正则匹配
- **热重载** — `aegis rules reload` 即时生效，无需重启服务
- **规则优先级** — 项目规则 > 用户自定义规则 > 内置规则，同 ID 规则自动覆盖
- **项目级规则** — `.aegis/rules/` 目录下放规则文件，只对该项目生效

### 🔌 Claude Code 集成

- **一键注入 Hook** — `aegis setup` 自动配置 Claude Code PreToolUse Hook
- **零侵入** — 不修改 Claude Code 本身，通过标准 Hook 机制工作
- **通用协议** — Hook 脚本通过 HTTP 与本地 Aegis 服务通信，任何支持 Hook 的 AI Agent 工具都可对接

### ⚡ 性能与可靠性

- **本地运行** — 所有逻辑在本地完成，无需网络，零延迟
- **SQLite 存储** — 审批历史、规则配置持久化存储
- **原子写入** — 配置修改采用原子写入，断电不会损坏
- **超时保护** — 审批 60 秒超时自动拒绝，Agent 不会因你离开而悄悄放行

---

## Built-in Rules

Aegis 内置 11 个规则集，覆盖 100+ 条规则，开箱即用：

| 规则集 | 文件 | 覆盖场景 |
|-------|------|---------|
| `defaults` | `defaults.yaml` | 系统关机/重启、`npm unpublish`、fork bomb、`:(){:\|:&};:` |
| `filesystem` | `filesystem.yaml` | `rm -rf`、删除根目录/主目录、`dd` 写入设备、`chmod -R` 系统目录、`mv` 覆盖系统文件 |
| `git` | `git.yaml` | main 分支 force push、非 main 分支 force push、`--force-with-lease`、`reset --hard`、`clean -f`、main 分支 rebase |
| `docker` | `docker.yaml` | `--privileged` 容器、挂载系统目录、删除所有镜像/容器/卷、`docker exec` 危险操作 |
| `mysql` | `mysql.yaml` | `DROP TABLE`、`DROP DATABASE`、`TRUNCATE`、`DELETE` 无条件删除、生产库操作 |
| `prisma` | `prisma.yaml` | `migrate reset`、`db push --force`、`db push --force-reset`、`db push --accept-data-loss` |
| `network` | `network.yaml` | 暴露公网端口、修改 `/etc/hosts`、`iptables` 规则修改、`nc` 反向 shell |
| `development` | `development.yaml` | `pip install` 非 PyPI 来源、`npm install -g` 全局安装、`eval` 执行动态代码 |
| `sqlite` | `sqlite.yaml` | 删除 `.db`/`.sqlite` 文件、生产数据库覆盖写入 |
| `security` | `aegis.config.yaml` | `cat .env`/`.pem`/`.key`、`curl` pipe bash、密钥复制到剪贴板 |

查看所有已加载规则：

```bash
aegis rules list
```

---

## Screenshots

|                      Dashboard                       |                      Approval                       |
| :-------------------------------------------------: | :-------------------------------------------------: |
| ![Dashboard](./docs/images/dashboard.png)            | ![Approval](./docs/images/approval.png)              |

---

## Quick Start

### 安装

```bash
npm install -g ai-aegis
```

> 安装时会自动编译 sqlite3 原生模块（约 1-2 分钟），为正常现象。

### 初始化

```bash
aegis setup
```

Setup 会做三件事：
1. 创建配置目录 `~/.aegis/`
2. 在 `~/.claude/settings.json` 注入 PreToolUse Hook
3. 生成自定义规则模板 `~/.aegis/rules/example-custom.yaml`

### 启动

```bash
aegis start
```

服务启动后访问 **http://localhost:3001** 打开监控界面。

以后每次使用 Claude Code 前，确保 Aegis 在运行即可。命令拦截、审批决策全自动。

---

## Custom Rules

你可以在 `~/.aegis/rules/` 目录下创建 `.yaml` 文件定义自己的规则。文件名以 `example-` 开头的会被跳过（模板用途）。

### 创建规则文件

```bash
aegis rules new          # 创建模板文件
aegis rules path         # 查看规则目录路径
aegis rules reload       # 热重载（无需重启服务）
```

### 规则文件格式

```yaml
name: "my-rules"
version: "2.0"

rules:
  - id: custom/deploy-prod
    description: "生产部署需人工确认"
    example: "sh deploy-prod.sh"
    category: "deploy"
    severity: "error"
    action: "review"
    reason: "部署到生产环境前需要你确认"
    selector:
      binary: sh
      arguments:
        - pattern: "deploy.*prod"

  - id: custom/rm-data-dir
    description: "禁止删除 data/ 目录"
    example: "rm -rf data/"
    category: "filesystem"
    severity: "block"
    action: "block"
    reason: "data/ 目录包含重要数据，禁止删除"
    selector:
      binary: rm
      arguments:
        - pattern: "data/"
```

### 匹配方式速查

| 匹配方式 | 写法 | 说明 |
|---------|------|------|
| 匹配命令名 | `binary: git` | 单个命令 |
| 匹配子命令 | `subcommands: [push]` | 如 git push |
| 匹配 Flag（任一即可） | `flags: { anyOf: [force, f] }` | --force 或 -f |
| 匹配 Flag（全部都要） | `flags: { allGroups: [[recursive, r], [force, f]] }` | -r 且 -f |
| 参数正则匹配 | `arguments: [{ pattern: "^/etc" }]` | 匹配 /etc 路径 |
| 完整命令正则 | `fullCommandPattern: "mysql.*prod.*<.*\\.sql"` | 管道/重定向场景 |

### 覆盖内置规则

用相同的 `id` 可以直接覆盖内置规则：

```yaml
rules:
  - id: fs/rm-rf              # 内置规则 ID
    action: "warn"             # 降级为仅记录，不再拦截
```

### 项目级规则

```bash
your-project/
└── .aegis/
    └── rules/
        └── project-rules.yaml   # 只对该项目生效
```

**优先级**：项目规则 > 用户自定义规则 > 内置规则

---

## CLI Reference

```bash
aegis setup              # 初始化，自动注入 Claude Code Hook
aegis start              # 启动服务（默认 :3001）
aegis start -p 8080      # 指定端口
aegis status             # 检查服务运行状态

aegis rules list         # 查看所有已加载规则（含来源）
aegis rules new          # 创建自定义规则模板
aegis rules path         # 查看用户规则目录路径
aegis rules reload       # 热重载规则（无需重启）
```

---

## FAQ

<details>
<summary><strong>命令没有被拦截？</strong></summary>

检查 Hook 是否注入成功：

```bash
cat ~/.claude/settings.json | grep aegis
```

如果没有出现 aegis 相关配置，重新运行 `aegis setup`。

确认 Aegis 服务正在运行：

```bash
aegis status
```

</details>

<details>
<summary><strong>审批弹窗消失了但没有回应？</strong></summary>

命令默认等待 60 秒，超时后**自动拒绝**执行。这个设计保证 Agent 不会因为你不在而悄悄放行高危命令。

如果你在弹窗关闭前点了"允许"或"拒绝"，命令会立即按你的决定执行。

</details>

<details>
<summary><strong>想临时关闭某条内置规则？</strong></summary>

在自定义规则文件里覆盖它，把 `action` 改成 `warn`（仅记录但不拦截）：

```yaml
rules:
  - id: fs/rm-rf
    action: "warn"
```

`aegis rules reload` 即时生效。

</details>

<details>
<summary><strong>会影响 Claude Code 的执行速度吗？</strong></summary>

不会。Aegis 是本地服务，Hook 评估通常在 50ms 以内完成（AST 解析 + 规则匹配 + SQLite 写入）。只有命中 `review` 规则时需要等待你审批，这是有意设计的停顿。

</details>

<details>
<summary><strong>可以用于 Claude Code 以外的工具吗？</strong></summary>

目前不行。目前平台只对接了Claude Code的hook，后续会对接Hermes、Codex等其他Agent Cli请看到时候的更新日志。

</details>

<details>
<summary><strong>项目级规则和全局规则同时存在，哪个先生效？</strong></summary>

Aegis 按优先级合并：**项目规则 > 用户自定义规则 > 内置规则**。同 `id` 的规则，高优先级会覆盖低优先级。不同 `id` 的规则全部生效。

</details>

<details>
<summary><strong>数据存储在哪里？</strong></summary>

- **配置 & 数据库**：`~/.aegis/`（SQLite + YAML 规则文件）
- **审批历史 & 事件记录**：`~/.aegis/data/`
- **规则热备份**：修改规则文件后自动备份原文件

</details>

---

## Architecture

```
                       ┌──────────────────────────────────┐
                       │         Claude Code / AI Agent      │
                       │            执行 bash 命令            │
                       └──────────┬───────────────────────┘
                                  │  PreToolUse Hook
                                  ▼
                       ┌──────────────────────────────────┐
                       │    universal-hook-v2.js             │
                       │    POST /api/v1/rules/evaluate      │
                       └──────────┬───────────────────────┘
                                  │  HTTP (localhost)
                                  ▼
                       ┌──────────────────────────────────┐
                       │       Aegis Backend (NestJS)        │
                       │  ┌──────────────────────────────┐  │
                       │  │  RuleMatcherService           │  │
                       │  │  ├─ AST Parser                 │  │
                       │  │  ├─ 11 YAML Rule Sets         │  │
                       │  │  ├─ Context Checks (git env)  │  │
                       │  │  └─ Risk Decision              │  │
                       │  └──────────┬───────────────────┘  │
                       │             │                       │
                       │    block / review / warn            │
                       │             │                       │
                       │    ┌────────▼──────────┐            │
                       │    │  WebSocket → UI    │            │
                       │    │  SSE Broadcast     │            │
                       │    │  SQLite Persist    │            │
                       │    └───────────────────┘            │
                       └──────────────────────────────────┘
                                  │
                    审批结果（允许/拒绝/超时）
                                  │
                                  ▼
                       ┌──────────────────────────────────┐
                       │    命令执行 / 终止返回错误           │
                       └──────────────────────────────────┘
```

---

## Tech Stack

| 层 | 技术 |
|---|------|
| CLI 入口 | Node.js + Commander + Inquirer |
| 后端 | NestJS + Bull (Redis) + SQLite (better-sqlite3) |
| 前端 | Vue 3 + Vite + Pinia + WebSocket |
| 规则引擎 | AST 命令解析 + YAML 规则集 |
| Hook 集成 | Claude Code PreToolUse Hook → HTTP |
| 通信 | HTTP REST + WebSocket (实时推送) |

---

## License

MIT © [yezannnnn](https://github.com/yezannnnn)
