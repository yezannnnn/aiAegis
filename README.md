<<<<<<< HEAD
# 🛡️ Aegis — AI Agent 实时安全监控系统

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2016.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%5E5.0.0-blue.svg)](https://www.typescriptlang.org/)

**宙斯之盾，守护您的 AI Agents**

Aegis 是一个专为 AI Agent（如 Claude Code）设计的实时安全监控系统，通过智能拦截危险命令保护您的系统安全。

## 🚀 快速开始

### 安装

```bash
# 全局安装
npm install -g aegis

# 或者本地开发
git clone https://github.com/yezannnnn/aegis.git
cd aegis && npm install && npm run build
```

### 基础使用

```bash
# 启动监控服务
aegis monitor

# 在另一个终端运行 AI Agent（已配置保护）
aegis run -- hermes chat -q "deploy project"
```

### 🔗 Claude Code 集成

```bash
# 一键设置（自动检测 Agent）
aegis setup

# 测试集成效果
./demo-claude-integration.sh

# 正常使用 Claude Code - 危险命令将被自动拦截
claude  # 您的危险命令将被 Aegis 拦截
```

**📖 [完整 Claude 集成指南](./CLAUDE-INTEGRATION-GUIDE.md)**

## 🛠️ 工作原理

```
AI Agent 执行命令 → Aegis 守护进程检查规则 → 监控界面显示通知 → 用户决策
```

### 支持的 AI Agent

| Agent | 集成方式 | 状态 |
|-------|---------|------|
| **Claude Code** | PreToolUse Hook | ✅ 完全支持 |
| **Hermes** | Plugin Hook (`pre_approval_request`) | ✅ 完全支持 |
| **OpenClaw** | `exec-approvals.yaml` socket 配置 | ✅ 完全支持 |
| **自定义 Agent** | Shell Integration | 🚧 开发中 |

### 🌐 实时监控界面

访问 **http://localhost:3001** 查看：
- 📊 实时拦截面板
- 🎯 风险评估结果
- 📝 操作历史记录
- ⚙️ 配置管理

## ⚙️ 安全规则配置

```bash
# 显示已加载的规则
aegis rules

# 编辑规则配置文件
aegis config edit  # 或直接编辑 ~/.aegis/rules.yaml
```

### 配置示例

```yaml
# ~/.aegis/rules.yaml

extends:
  - aegis/recommended        # 内置推荐规则
  - npm:aegis-rules-docker   # 社区 Docker 规则
  - github:security-team/corporate-rules  # 企业规则

rules:
  "recursive delete": error       # 拦截并要求确认
  "git force push": warn          # 仅警告，不拦截
  "npm global install": off       # 跳过此规则
  "SQL DROP": block               # 无条件拒绝

# 自定义规则
custom_rules:
  - pattern: "docker.*--privileged"
    risk_level: HIGH
    message: "检测到特权容器操作"
    action: error
```

### 规则严重性级别

| 级别 | 行为 | 图标 |
|------|------|------|
| `block` | 无条件拒绝 (红线) | 🔴 |
| `error` | 需要用户确认 (危险) | ⚠️ |
| `warn` | 仅通知，自动允许 | 🟡 |
| `off` | 跳过检查 | ⚪ |

## Community Rules

```yaml
extends:
  - aegis/recommended
  - github:ah-piao/aegis-rules-docker   # from GitHub
  - npm:aegis-rules-security            # from npm
  - https://rules.example.com/aegis.yaml # from URL
  - ./team-rules.yaml                   # local file
```

## ✨ 核心特性

### 🧠 智能风险评估
- **AST 语义分析** - 基于语法树的智能分析（非正则表达式）
- **上下文感知** - 考虑 Git 状态、项目类型、系统权限
- **风险评分** - 0-100 分风险等级，附详细解释
- **误报率** - <5% （传统正则方案误报率 25-40%）

### 🔗 原生 Agent 集成
- **Claude Code** - PreToolUse Hook 自动集成
- **Hermes** - Plugin 系统深度集成
- **OpenClaw** - Socket 配置无缝连接
- **Shell 集成** - 跨平台命令拦截

### 🖥️ 跨平台支持
- **macOS** - 完整支持，含原生通知
- **Linux** - 完整功能支持
- **Windows** - 开发中

### ⚡ 性能与可靠性
- **亚秒响应** - <100ms 闪电般分析速度
- **降级保护** - 守护进程离线时的基础规则保护
- **会话白名单** - 记住用户决策，减少重复询问
- **异步分析** - 非阻塞后台检查

### 🛡️ 企业级安全
- **生产环境就绪** - 为企业环境设计
- **完整审计日志** - 所有操作历史记录
- **多层防护** - Hook + AST + 监控三重保护
- **零关键误报** - 关键操作绝不误报

### 📊 监控与分析
- **实时面板** - 直观的 Web 监控界面
- **历史追踪** - 完整的拦截和决策历史
- **统计报告** - 风险趋势和安全指标
- **快捷操作** - A(允许)/D(拒绝)/S(会话) 快捷键

## 📦 发布规则包

只需一个 YAML 文件：

```yaml
# aegis-rules-myteam.yaml
name: aegis-rules-myteam
version: "1.0.0"
description: "我们团队的自定义安全规则"

rules:
  - pattern: '\\bdeploy\\s+--prod\\b'
    description: "生产环境部署"
    category: "deploy"
    severity: error

  - pattern: 'kubectl.*delete.*--all'
    description: "Kubernetes 批量删除"
    category: "k8s"
    severity: block
```

```bash
# 发布到 npm
npm publish aegis-rules-myteam

# 在项目中使用
extends:
  - npm:aegis-rules-myteam
```

## 🔧 开发指南

### 项目结构

```
aegis/
├── src/                 # TypeScript 源代码
│   ├── ast/            # AST 解析器
│   ├── rules/          # 规则引擎
│   ├── socket/         # WebSocket 通信
│   ├── integrations/   # AI Agent 集成
│   └── monitor/        # 监控界面
├── dist/               # 编译输出
├── scripts/            # 工具脚本
└── docs/               # 项目文档
```

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式（自动重编译）
npm run dev

# 构建项目
npm run build

# 运行测试
npm test

# 代码检查
npm run lint
```

## ❓ 常见问题

### Q: 为什么有些命令没有被拦截？

A: 请检查以下几点：
1. Aegis daemon 是否正在运行：`ps aux | grep aegis`
2. 环境变量是否设置：`echo $CLAUDE_BASH_HOOK_PATH`
3. Hook 文件是否存在：`ls ~/.aegis/claude-hook.js`

### Q: 如何添加自定义规则？

A: 编辑 `~/.aegis/rules.yaml` 文件：
```yaml
custom_rules:
  - pattern: "your-dangerous-command"
    risk_level: HIGH
    message: "自定义风险说明"
```

### Q: 如何临时禁用拦截？

A: 使用会话模式：
- 在监控界面按 `S` 键
- 或设置环境变量：`export AEGIS_SESSION_ALLOW=true`

## 🤝 贡献指南

我们欢迎任何形式的贡献！

1. **Fork** 本仓库
2. **创建** 特性分支：`git checkout -b feature/amazing-feature`
3. **提交** 更改：`git commit -m 'Add amazing feature'`
4. **推送** 分支：`git push origin feature/amazing-feature`
5. **创建** Pull Request

### 开发规范

- 遵循 TypeScript 严格模式
- 添加适当的单元测试
- 保持代码风格一致
- 更新相关文档

## 🆘 获取帮助

- 🐛 **问题反馈**: [GitHub Issues](https://github.com/yezannnnn/aegis/issues)
- 💬 **讨论交流**: [GitHub Discussions](https://github.com/yezannnnn/aegis/discussions)
- 📚 **详细文档**: [Wiki](https://github.com/yezannnnn/aegis/wiki)

## 📄 许可证

MIT © [yezannnnn](https://github.com/yezannnnn)

---

⭐ **如果这个项目对您有帮助，请给我们一个 Star！**

🛡️ **让 AI Agent 更安全，让开发更放心！**
=======
# 🛡️ Aegis Security Monitor v2.0

**AI Agent安全监控系统 - 全新CLI版本**

## 🚀 极简安装使用

### 一键全局安装
```bash
npm install -g aegis-security-monitor
```

### 三步启动系统
```bash
# 1. 初始化配置
aegis setup

# 2. 启动服务  
aegis start

# 3. 访问界面
# http://localhost:5173 (前端)
# http://localhost:3001 (后端API)
```

**就这么简单！** 🎉

## ✨ 全新特性

### 🎯 零配置体验
- **一行安装**: `npm install -g aegis-security-monitor`
- **自动配置**: Claude Code Hook自动集成
- **开箱即用**: 无需手动配置文件

### 🚀 专业CLI工具
```bash
aegis setup          # 系统初始化
aegis start          # 启动所有服务
aegis status         # 检查服务状态
aegis config --list  # 查看配置
aegis --help         # 获取帮助
```

### 🔧 灵活启动选项
```bash
aegis start                    # 启动前后端
aegis start --backend-only     # 仅后端
aegis start --frontend-only    # 仅前端
aegis start -p 3002           # 自定义端口
```

## 🏗️ 技术架构升级

| 组件 | v1.0 (旧版) | v2.0 (新版) |
|------|-------------|-------------|
| **安装方式** | Git Clone | NPM全局包 |
| **启动方式** | 手动多步骤 | 一键CLI命令 |
| **后端框架** | 原生Node.js | NestJS + TypeScript |
| **前端框架** | HTML + JS | Vue 3 + TypeScript |
| **WebSocket** | 原生ws | Socket.IO |
| **API文档** | 无 | 自动Swagger |
| **状态管理** | 全局变量 | Pinia响应式 |
| **类型安全** | 部分 | 完整TypeScript |

## 🎨 功能保持100%兼容

✅ **完全相同的UI**: 保持暗色科技风界面设计  
✅ **实时监控**: WebSocket数据推送  
✅ **审批弹窗**: 命令批准/拒绝流程  
✅ **规则引擎**: YAML配置 + AST解析  
✅ **多语言**: 中英文界面切换  
✅ **Hook集成**: 支持Claude/Hermes等AI工具

## 🔌 自动Hook集成

安装后自动配置Claude Code：
```json
// ~/.config/claude-code/settings.json (自动生成)
{
  "preToolUseHook": "node ~/.aegis/universal-hook.js"
}
```

支持的AI工具：
- ✅ Claude Code
- ✅ Hermes  
- ✅ Cursor
- ✅ 其他AI CLI工具

## 📂 自动目录管理

```
~/.aegis/                    # 用户配置目录 (自动创建)
├── rules/                   # 安全规则配置
│   └── aegis-rules.yaml    # 主规则文件
├── logs/                    # 系统日志
├── universal-hook.js        # Hook处理脚本
└── config.json             # 系统配置
```

## 🚀 开发者指南

### 本地开发
```bash
# Clone源码
git clone https://github.com/aegis-team/security-monitor
cd aegis-v2

# 本地安装依赖
./install.sh

# 本地启动
./start.sh
```

### 项目结构
```
aegis-v2/
├── bin/                     # CLI命令脚本
│   ├── aegis.js            # 主CLI入口
│   └── post-install.js     # 安装后脚本
├── backend/                 # NestJS后端
│   ├── src/modules/        # 业务模块
│   └── package.json        # 后端依赖
├── frontend/               # Vue3前端  
│   ├── src/views/          # 页面组件
│   ├── src/stores/         # 状态管理
│   └── package.json        # 前端依赖
└── package.json            # 主包配置
```

## 🆚 使用体验对比

### v1.0 (旧版本)
```bash
git clone https://github.com/aegis/monitor
cd monitor
npm install
cd backend && npm install && npm start &
cd frontend && npm install && npm run dev &
# 手动配置Claude Code settings.json
# 手动复制rule文件
```
**步骤**: 8+ | **复杂度**: 高 | **用户**: 开发者

### v2.0 (CLI版本)
```bash
npm install -g aegis-security-monitor
aegis setup
aegis start
```
**步骤**: 3 | **复杂度**: 零 | **用户**: 任何人

## 📊 监控功能

### 实时Dashboard
- 📈 命令统计 (总数/阻止/允许/警告/待审批)
- 🤖 活跃AI代理监控
- 📱 活跃会话管理  
- ⚡ 实时安全事件流

### 智能审批系统
- 🔔 弹窗审批请求
- ⏱️ 超时自动处理
- 📋 审批历史记录
- 🎯 风险级别分类

### 安全规则引擎
- 📝 YAML配置文件
- 🧠 AST语法解析
- 🔍 模式匹配检测
- ⚙️ 自定义规则支持

## 📝 更新日志

### v2.0.0 (2026-05-03)
- 🎉 发布全球CLI包
- 🔄 重构为NestJS + Vue架构  
- 📦 零配置安装体验
- 🚀 自动Hook集成
- 📚 自动API文档生成
- 🔒 完整TypeScript类型安全

## 🤝 贡献指南

欢迎提交Issue和PR！

- 📖 [开发文档](./docs/DEVELOPMENT.md)
- 🐛 [Bug报告](https://github.com/aegis-team/security-monitor/issues)
- 💡 [功能建议](https://github.com/aegis-team/security-monitor/discussions)

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件
>>>>>>> origin/master
