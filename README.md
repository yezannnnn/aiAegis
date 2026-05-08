# 🛡️ Aegis — AI Agent 高危命令拦截器

[![npm](https://img.shields.io/npm/v/ai-aegis.svg)](https://www.npmjs.com/package/ai-aegis)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## 它是什么

AI Agent（Claude Code、Cursor、Copilot……）是个黑盒子。你给它一个任务，它会自主执行一系列命令——大多数时候没问题，但偶尔它会做出你根本没想到的操作：`rm -rf`、`DROP TABLE`、向生产库直接写入、或者把密钥打印到终端。

**Aegis 是最后一道防线。** 它在命令真正执行之前介入，把高危操作拦下来，在你的监控界面弹出审批请求——你说允许才放行，你说拒绝就终止。

```
AI Agent 发出命令 → Aegis 拦截 → 你在监控界面审批 → 命令执行或终止
```

![Aegis 拦截演示](./demo.gif)

---

## 快速开始

### 安装

```bash
npm install -g ai-aegis
```

> 安装时会自动在后台编译 sqlite3 原生模块（约 1-2 分钟），这是正常现象。

### 初始化

```bash
aegis setup
```

Setup 会做三件事：
1. 创建用户配置目录 `~/.aegis/`
2. 在你的 `~/.claude/settings.json` 里注入 Hook（自动拦截 Claude Code 发出的命令）
3. 生成一份自定义规则模板 `~/.aegis/rules/example-custom.yaml`

### 启动

```bash
aegis start
```

服务启动后访问 **http://localhost:3001** 打开监控界面。

以后每次使用 Claude Code 前，只需要确保 Aegis 在运行即可。

---

## 工作原理

Aegis 通过 Claude Code 的 **PreToolUse Hook** 接管每一条即将执行的 Bash 命令。Hook 脚本将命令发送到本地 Aegis 服务，服务用内置规则 + 你的自定义规则判断风险等级：

| 风险等级 | 行为 |
|---------|------|
| `block` | 直接拒绝，命令不执行，无法审批 |
| `review` | 弹出审批窗口，等你点允许或拒绝 |
| `warn` | 仅记录，命令正常放行 |

监控界面会实时展示所有事件、审批历史和统计数据。

---

## 内置规则

Aegis 自带一套覆盖常见风险场景的规则，开箱即用：

| 规则集 | 覆盖场景 |
|-------|---------|
| `defaults` | 系统关机/重启、npm unpublish |
| `filesystem` | rm -rf、覆写系统文件 |
| `git` | force push、reset --hard |
| `docker` | --privileged 容器、删除所有镜像 |
| `mysql` | DROP TABLE、清空数据库、GRANT ALL |
| `sqlite` | DROP TABLE/INDEX/VIEW、无条件 DELETE、.dump 导出、删除 .db 文件 |
| `prisma` | migrate reset、db push --force |
| `network` | 暴露公网端口、修改 hosts |
| `development` | pip 安装非官方来源的包 |

查看当前加载的所有规则：

```bash
aegis rules list
```

---

## 自定义规则

你可以在 `~/.aegis/rules/` 目录下创建任意 `.yaml` 文件来定义自己的规则。文件名以 `example-` 开头的会被跳过（模板用途）。

> 完整的规则语法参考见 **[规则编写指南 →](./docs/rules-authoring.md)**

### 创建规则文件

```bash
aegis rules new <name>            # 在 ~/.aegis/rules/ 创建全局规则模板
aegis rules new <name> --project  # 在当前项目 .aegis/rules/ 创建项目级规则（可提交 git）
aegis rules path                  # 查看规则目录路径
```

### 规则文件格式

```yaml
name: "my-rules"
version: "2.0"

rules:
  - id: custom/your-rule-id
    description: "规则说明"
    example: "触发此规则的示例命令"  # 可选，不填则自动推断
    category: "filesystem"           # 分类（自由填写）
    severity: "error"                # error / block / warn
    action: "review"                 # review（需审批）/ block（直接拒绝）/ warn（仅记录）
    reason: "展示给用户的风险说明"
    selector:
      # 匹配条件（见下方说明）
```

### selector 字段说明

#### `binary` — 匹配命令名

```yaml
selector:
  binary: rm                    # 单个命令
  binary: [curl, wget]          # 多个（任意一个触发）
```

#### `subcommands` — 匹配子命令（有序前缀）

```yaml
selector:
  binary: docker
  subcommands: [system, prune]  # 匹配 docker system prune ...
```

#### `flags` — 匹配命令标志

```yaml
# 任意一个即触发
selector:
  flags:
    anyOf: [force, f]

# 必须同时存在
selector:
  flags:
    allOf: [verbose, v]

# 分组 AND — 每组内 anyOf，组间 allOf
# 下例：要求同时有 -r/-recursive 和 -f/--force
selector:
  flags:
    allGroups:
      - [recursive, r]
      - [force, f]
```

#### `arguments` — 匹配位置参数（支持正则）

```yaml
selector:
  binary: rm
  arguments:
    - pattern: "^/\\*?$"         # 匹配 / 或 /*，默认任意位置
    - pattern: "^(stop|disable)$"
      anyPosition: false
      position: 0                 # 只看第 0 个位置参数
```

#### `hasPipes` + `anySegment` — 管道检测

```yaml
# 拦截 curl | sh 类命令
selector:
  binary: [curl, wget]
  hasPipes: true
  anySegment:                    # 管道中任意一段满足即触发
    binary: [sh, bash, zsh, dash, fish]
```

#### `rawPattern` — 匹配整条命令字符串（正则）

```yaml
selector:
  binary: mysqldump
  rawPattern: "--all-databases"  # 对整条命令做正则匹配
```

#### `contextChecks` — 上下文条件

```yaml
selector:
  binary: git
  contextChecks:
    gitBranch: [main, master]    # 只在主分支触发
```

### 完整示例

```yaml
name: "team-rules"
version: "2.0"

rules:
  # 禁止删除 data/ 目录（直接拒绝，无法审批）
  - id: custom/rm-data-dir
    description: "禁止删除 data/ 目录"
    category: "filesystem"
    severity: "block"
    action: "block"
    reason: "data/ 目录包含重要数据，禁止删除"
    selector:
      binary: rm
      arguments:
        - pattern: "data/"

  # 生产环境部署需要人工审批
  - id: custom/deploy-prod
    description: "生产部署需人工确认"
    category: "deploy"
    severity: "error"
    action: "review"
    reason: "部署到生产环境前需要你确认"
    selector:
      binary: sh
      arguments:
        - pattern: "deploy.*prod"

  # 防止 .env 文件被打印到终端
  - id: custom/cat-env
    description: "防止 .env 被输出到终端"
    category: "security"
    severity: "block"
    action: "block"
    reason: "防止 API 密钥等机密信息泄露"
    selector:
      binary: cat
      arguments:
        - pattern: "\\.env$"

  # 拦截管道命令（curl 下载脚本直接执行）
  - id: custom/curl-to-shell
    description: "禁止 curl | sh 执行远程脚本"
    category: "network"
    severity: "block"
    action: "block"
    reason: "直接执行远程脚本存在供应链攻击风险"
    selector:
      binary: [curl, wget]
      hasPipes: true
      anySegment:
        binary: [sh, bash, zsh]

  # 强推主分支需要审批
  - id: custom/force-push-main
    description: "主分支 force push 需确认"
    category: "git"
    severity: "error"
    action: "review"
    reason: "主分支 force push 会覆盖团队提交"
    selector:
      binary: git
      subcommands: [push]
      flags:
        anyOf: [force, f]
      contextChecks:
        gitBranch: [main, master]

  # 覆盖内置规则：把 fs/rm-rf 从 review 升级为 block
  - id: fs/rm-rf
    severity: "block"
    action: "block"
    reason: "本项目绝对禁止 rm -rf"
```

> **覆盖内置规则**：用相同的 `id` 即可。用户规则优先级高于内置规则，相同 `id` 的规则会被替换。

### 规则生效

修改规则文件后，无需重启服务：

```bash
aegis rules reload
```

---

## 项目级规则

除了全局的 `~/.aegis/rules/`，你还可以在项目目录下放规则，只对该项目生效：

```
your-project/
└── .aegis/
    └── rules/
        └── project-rules.yaml
```

项目规则优先级高于用户全局规则。

---

## 命令参考

```bash
aegis setup              # 初始化，配置 Hook
aegis start              # 启动服务（默认端口 3001）
aegis start -p 8080      # 指定端口
aegis status             # 检查服务状态

aegis rules list                   # 查看所有已加载规则（含来源、示例命令）
aegis rules new <name>             # 创建全局自定义规则模板
aegis rules new <name> --project   # 创建项目级规则（写入 .aegis/rules/）
aegis rules path                   # 查看用户规则目录
aegis rules reload                 # 热重载规则（无需重启）
```

---

## 常见问题

**Q: 命令没有被拦截？**

检查 Hook 是否注入成功：

```bash
cat ~/.claude/settings.json | grep aegis
```

如果没有，重新运行 `aegis setup`。

**Q: 审批弹窗消失了但没有回应？**

命令默认等待 60 秒，超时后自动拒绝执行，保证 Agent 不会因为你不在而悄悄放行。

**Q: 想临时关掉某条内置规则？**

在你的自定义规则文件里覆盖它，把 `action` 改成 `warn`（仅记录但不拦截）：

```yaml
rules:
  - id: fs/rm-rf          # 内置规则 id
    action: "warn"        # 不再拦截，只记录
```

---

## 许可证

MIT © [yezannnnn](https://github.com/yezannnnn)
