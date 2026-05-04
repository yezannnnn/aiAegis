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