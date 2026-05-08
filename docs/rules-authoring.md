# 规则编写指南 — Selector DSL v2.0

Aegis 使用 YAML 定义拦截规则。每条规则由 **元信息** + **selector**（匹配条件）组成，selector 匹配成功后按 `action` 决定是放行、审批还是直接拦截。

---

## 文件位置

| 位置 | 作用域 | Git |
|------|--------|-----|
| `~/.aegis/rules/*.yaml` | 全局，对所有项目生效 | 不提交 |
| `<project>/.aegis/rules/*.yaml` | 项目级，只对当前项目生效 | 可提交 |

文件名以 `example-` 开头的会被跳过（模板用途）。

---

## 基础结构

```yaml
name: "my-rules"       # 规则集名称（任意）
version: "2.0"

rules:
  - id: custom/rule-id           # 唯一 ID，用 / 分层，建议 分类/名称
    description: "一句话描述"
    example: "触发示例命令"       # 可选，用于 aegis rules list 展示
    category: "filesystem"        # 分类（自由填写）
    severity: "error"             # error | block | warn
    action: "review"              # review | block | warn
    reason: "展示给用户的风险说明"
    selector:
      # 匹配条件 ↓
```

### action 说明

| action | 行为 |
|--------|------|
| `block` | 直接拒绝，命令不执行，无法审批 |
| `review` | 弹出审批窗口，等待用户点击允许或拒绝 |
| `warn` | 仅记录事件，命令正常放行 |

---

## selector 字段详解

### `binary` — 匹配命令名

```yaml
selector:
  binary: rm                  # 精确匹配单个命令
  # 或
  binary: [curl, wget]        # 多个命令，任意一个触发
```

---

### `subcommands` — 匹配子命令（有序前缀）

用于 `docker`、`git`、`npm`、`prisma` 等多级子命令结构。按位置顺序检查。

```yaml
selector:
  binary: docker
  subcommands: [system, prune]   # 匹配 docker system prune ...

selector:
  binary: npx
  subcommands: [prisma, migrate, reset]  # 匹配 npx prisma migrate reset
```

---

### `flags` — 匹配命令标志

支持三种语义：

#### `anyOf` — 任意一个标志存在即触发

```yaml
selector:
  binary: git
  flags:
    anyOf: [force, f]      # --force 或 -f
```

#### `allOf` — 所有标志都必须存在

```yaml
selector:
  flags:
    allOf: [verbose, v, all]
```

#### `allGroups` — 分组 AND（每组内 anyOf，组间全部满足）

适合 `rm -rf` 这类需要同时有 `-r` 和 `-f` 才危险的场景：

```yaml
selector:
  binary: rm
  flags:
    allGroups:
      - [recursive, r]     # 组1：有 -r 或 --recursive
      - [force, f]         # 组2：有 -f 或 --force
                           # 两组都满足才触发（rm -r 单独不触发）
```

---

### `arguments` — 匹配位置参数（正则）

匹配命令中非标志的参数（路径、名称等）。

```yaml
selector:
  binary: rm
  arguments:
    - pattern: "^/\\*?$"         # 匹配 / 或 /*

selector:
  binary: systemctl
  arguments:
    - pattern: "^(stop|disable|mask)$"
      anyPosition: false          # 不是任意位置
      position: 0                 # 只检查第 0 个位置参数
    - pattern: "^(ssh|nginx|cron)"  # 第二个条件任意位置（默认）
```

`anyPosition` 默认为 `true`（任意位置匹配）。设为 `false` 后需配合 `position` 使用。

---

### `hasPipes` + `anySegment` — 管道检测

检测命令是否通过管道，且管道中某一段满足子 selector。

```yaml
# 拦截 curl https://... | sh
selector:
  binary: [curl, wget]
  hasPipes: true
  anySegment:                    # 管道中任意一段满足以下条件
    binary: [sh, bash, zsh, dash, fish]
```

`anySegment` 支持完整的 selector 语法（嵌套使用）。

---

### `rawPattern` — 原始字符串正则（兜底方案）

对整条命令字符串做正则匹配，适合 flag 值复杂或难以结构化解析的场景。

```yaml
selector:
  binary: mysqldump
  rawPattern: "--all-databases"

selector:
  binary: ssh
  rawPattern: "StrictHostKeyChecking=no|UserKnownHostsFile=/dev/null"
```

---

### `contextChecks` — 上下文条件

结合运行时上下文（git 分支、是否生产环境等）动态调整匹配。

```yaml
selector:
  binary: git
  subcommands: [push]
  flags:
    anyOf: [force, f]
  contextChecks:
    gitBranch: [main, master]    # 只在主分支触发，其他分支放行
```

---

## 完整示例

```yaml
name: "team-rules"
version: "2.0"

rules:
  # 1. 禁止删除 data/ 目录
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

  # 2. 防止 .env 文件被打印到终端
  - id: custom/cat-env
    description: "防止 .env 被输出到终端"
    category: "security"
    severity: "block"
    action: "block"
    reason: "防止 API 密钥等机密信息泄露"
    selector:
      binary: cat
      arguments:
        - pattern: "\\.env(\\.local)?$"

  # 3. curl | sh 管道执行远程脚本
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
        binary: [sh, bash, zsh, dash, fish]

  # 4. 生产环境部署需要审批
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

  # 5. 主分支 force push 需要审批
  - id: custom/force-push-main
    description: "主分支 force push 需确认"
    category: "git"
    severity: "error"
    action: "review"
    reason: "主分支 force push 会覆盖团队提交历史"
    selector:
      binary: git
      subcommands: [push]
      flags:
        anyOf: [force, f]
      contextChecks:
        gitBranch: [main, master]

  # 6. 覆盖内置规则：把 fs/rm-rf 从 review 升级为 block
  - id: fs/rm-rf
    action: "block"
    severity: "block"
    reason: "本项目绝对禁止 rm -rf"
```

---

## 覆盖内置规则

在自定义规则文件中使用与内置规则相同的 `id` 即可覆盖。用户规则优先级高于内置规则。

常见用途：将 `review` 升级为 `block`，或反过来降级为 `warn`（仅记录）：

```yaml
rules:
  - id: fs/rm-rf
    action: "warn"     # 降级：不再拦截，只记录
```

---

## 规则热重载

修改规则文件后，无需重启服务：

```bash
aegis rules reload
```

---

## selector 字段速查

| 字段 | 类型 | 说明 |
|------|------|------|
| `binary` | `string \| string[]` | 命令名，支持多个 |
| `subcommands` | `string[]` | 子命令有序前缀匹配 |
| `flags.anyOf` | `string[]` | 标志任意一个存在 |
| `flags.allOf` | `string[]` | 标志全部存在 |
| `flags.noneOf` | `string[]` | 标志全部不存在 |
| `flags.allGroups` | `string[][]` | 分组 AND，组内 anyOf |
| `arguments[].pattern` | `string` | 参数正则（JavaScript 语法） |
| `arguments[].position` | `number` | 限定检查第几个参数 |
| `arguments[].anyPosition` | `boolean` | 默认 `true`，设 `false` 后需配合 `position` |
| `rawPattern` | `string` | 整条命令字符串正则 |
| `hasPipes` | `boolean` | 是否包含管道 |
| `anySegment` | `Selector` | 管道中任意一段满足该子 selector |
| `contextChecks.gitBranch` | `string[]` | 当前 git 分支在列表中时触发 |
