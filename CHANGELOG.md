# Changelog / 更新日志

All notable changes to Aegis are documented here.  
Aegis 所有重要变更均记录于此。

---

## [0.3.2] - 2025-05-11

### Features / 新功能
- `aegis setup` now automatically registers the PostToolUse Bash hook, enabling user input context indexing for PreToolUse  
  `aegis setup` 现在自动注册 PostToolUse Bash hook，支持 PreToolUse 读取用户输入上下文

### Chores / 杂项
- Remove `package-lock.json` files from version control and add to `.gitignore`  
  从版本控制中移除 `package-lock.json`，加入 `.gitignore`

---

## [0.3.1] - 2025-05

### Features / 新功能
- Copy `post-tool-use-handler.js` to `~/.aegis/` during setup  
  setup 时自动将 `post-tool-use-handler.js` 复制到 `~/.aegis/`

### Fixes / 修复
- Resolve port configuration sync issue (`ports.webInterface` + `backend.port`)  
  修复端口配置不同步问题
- Improve notification UX  
  改善通知交互体验
- All hook console output in English  
  Hook 所有控制台输出改为英文
- Remove remaining Chinese strings from approval reason and event labels  
  移除审批原因和事件标签中剩余的中文字符串
- Browser notifications follow UI language setting  
  浏览器通知跟随界面语言设置

### Docs / 文档
- Add Supported Agents table (Claude Code + Hermes) in README (EN + CN)  
  README 中新增支持的 Agent 对比表（Claude Code + Hermes）
- Add OpenClaw, Codex, OpenCode as "coming soon" in agent table  
  在 Agent 表中标注 OpenClaw、Codex、OpenCode 为 Coming Soon

---

## [0.3.0] - 2025-04

### Features / 新功能
- **Hermes Plugin Hook** — `pre_llm_call` caches user input; `pre_tool_call` reads cache for context  
  **Hermes 插件 Hook** — `pre_llm_call` 缓存用户输入，`pre_tool_call` 读取缓存获取上下文
- Hermes auto-enable via `hermes plugins enable aegis` during setup  
  setup 时自动执行 `hermes plugins enable aegis`
- Rule `reason` field internationalization (en/zh)  
  规则 `reason` 字段支持国际化（中/英）
- PostToolUse user input indexing — display user context in security events  
  PostToolUse 用户输入索引，在安全事件中展示用户上下文
- Task ID tracking in event list (via `parentUuid` chain)  
  事件列表支持 Task ID 追踪（通过 `parentUuid` 链）
- Detect agent persona from `PERSONA.md` or cwd dirname  
  从 `PERSONA.md` 或工作目录名自动识别 Agent 身份
- Capture model name from session transcript  
  从会话记录中自动读取模型名称
- Time filter (1H / 24H / TODAY / ALL TIME) in event list  
  事件列表新增时间筛选器（1H / 24H / TODAY / ALL TIME）

### Fixes / 修复
- Multi-session agent tracking, block/allow recording, WebSocket CORS  
  多 session Agent 追踪、拦截/放行记录、WebSocket CORS 修复
- `agent_update` dedup by `type+sessionId`  
  `agent_update` 按 `type+sessionId` 去重
- Frontend listens for `new_event` for real-time push  
  前端监听 `new_event` 事件实现实时推送
- Hermes double-trigger issue  
  修复 Hermes 双重触发问题
- Intercept count statistics  
  修复拦截次数统计错误
- Accept HTTP 201 from backend evaluate API  
  后端 evaluate 接口接受 HTTP 201 响应
- CLI output fully in English; fix `[object Object]` in rules list  
  CLI 全面英文化；修复规则列表显示 `[object Object]`

### Chores / 杂项
- Bump version to 0.3.0; publish to npm  
  版本升至 0.3.0，发布 npm

---

## [0.2.0] - 2025-03

### Features / 新功能
- **Selector DSL v2** — BashAstService with full test suite  
  **Selector DSL v2** — BashAstService，附完整测试套件
- SQLite rule set (`sqlite.yaml`)  
  新增 SQLite 规则集
- User-defined rules: `aegis rules new`, `aegis rules reload`, `--project` flag  
  用户自定义规则：`aegis rules new`、`aegis rules reload`、`--project` 标志
- `aegis rules list` shows rules by source (built-in / user / project)  
  `aegis rules list` 按来源分组展示规则
- Event list scroll pagination  
  事件列表滚动分页加载
- TIMEOUT filter and smart time display in event list  
  事件列表新增 TIMEOUT 筛选器和智能时间显示
- Notification permission modal with i18n and denied guide  
  通知权限模态框，支持 i18n 和权限被拒引导

### Fixes / 修复
- SQL rule `(?i)` flag was silently invalidating all rules  
  修复 SQL 规则 `(?i)` 标志导致所有规则静默失效
- WebSocket timeout events incorrectly handled as `deny`  
  修复 WebSocket 超时事件被误处理为 deny
- `approvalId` bug fix  
  修复 approvalId 相关 bug

### Refactor / 重构
- npm single-package architecture — compiled artifacts run directly  
  npm 单包架构，编译产物直接运行，无需分别启动前后端
- Remove v1 legacy code and unused files  
  清理旧版 v1 代码和无用文件
- Reorganize `hooks/` for multi-AI-tool support  
  重组 `hooks/` 目录，支持多 AI 工具（Claude Code、Hermes）
- Configurable approval timeout  
  审批超时时间可配置

### Docs / 文档
- Selector DSL v2.0 rule writing guide  
  Selector DSL v2.0 规则编写指南
- `example` field and `--project` flag documented  
  `example` 字段和 `--project` 标志说明

---

## [0.1.0] - 2025-02

### Features / 新功能
- Initial Aegis v2 — NestJS backend + Vue 3 frontend + CLI (`aegis setup / start / build`)  
  Aegis v2 初始版本 — NestJS 后端 + Vue 3 前端 + CLI
- PreToolUse hook intercepts Bash commands in Claude Code  
  PreToolUse hook 拦截 Claude Code 中的 Bash 命令
- YAML rule engine with `block` / `review` / `allow` actions  
  YAML 规则引擎，支持 `block` / `review` / `allow` 三种动作
- Real-time approval via WebSocket — approve or deny from dashboard  
  WebSocket 实时审批，直接在 Dashboard 批准或拒绝
- Built-in rule sets: filesystem, git, network, docker, mysql, prisma, development  
  内置规则集：文件系统、git、网络、docker、mysql、prisma、开发环境
- `aegis rules` CLI subcommands (list, new, path, reload)  
  `aegis rules` CLI 子命令
- `aegis status` and `aegis config` commands  
  新增 `aegis status` 和 `aegis config` 命令
- English + Chinese README  
  中英双语 README

---

*Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)*
