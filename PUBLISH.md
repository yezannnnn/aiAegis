# Aegis NPM包发布指南

## 🚀 全局CLI使用流程

### 用户使用流程
```bash
# 1. 全局安装
npm install -g aegis-security-monitor

# 2. 初始化系统
aegis setup

# 3. 启动服务
aegis start

# 4. 检查状态
aegis status
```

## 📦 发布到NPM

### 1. 准备发布
```bash
# 确保已登录npm
npm login

# 检查包名是否可用
npm info aegis-security-monitor

# 构建项目
npm run build
```

### 2. 发布命令
```bash
# 发布到npm
npm publish

# 或发布beta版本
npm publish --tag beta
```

### 3. 测试安装
```bash
# 测试全局安装
npm install -g aegis-security-monitor

# 测试命令
aegis --help
aegis setup
aegis start
```

## 📋 CLI命令完整列表

### 基础命令
- `aegis setup` - 初始化和配置系统
- `aegis start` - 启动前后端服务
- `aegis status` - 检查服务状态
- `aegis config` - 配置管理

### Setup选项
```bash
aegis setup --skip-deps        # 跳过依赖安装
aegis setup --port 3001        # 指定后端端口
```

### Start选项
```bash
aegis start                     # 启动所有服务
aegis start --backend-only      # 仅启动后端
aegis start --frontend-only     # 仅启动前端
aegis start -p 3002            # 指定后端端口
aegis start -f 8080            # 指定前端端口
```

### Config选项
```bash
aegis config --list            # 列出当前配置
aegis config --reset           # 重置配置
```

## 🔧 安装后的目录结构

```
~/.aegis/                      # 用户配置目录
├── rules/                     # 安全规则
│   ├── aegis-rules.yaml      # 主规则文件
│   └── custom-rules.yaml     # 自定义规则
├── logs/                      # 日志文件
├── universal-hook.js          # Claude Code Hook
└── config.json               # 系统配置
```

## 🎯 自动集成功能

### Claude Code集成 (完整实现)
安装后自动配置：
- ✅ 自动创建 `~/.aegis` 配置目录
- ✅ 复制 `universal-hook.js` (集成规则引擎)
- ✅ 复制 `rule-engine.js` (YAML规则处理)  
- ✅ 复制 `aegis-rules.yaml` (默认安全规则)
- ✅ 自动修改 `~/.config/claude-code/settings.json`
- ✅ 添加 `preToolUseHook` 配置指向Hook文件
- ✅ 备份原Claude配置到 `~/.aegis/backup/`

### 服务启动
一个命令启动所有服务：
- NestJS后端 (端口3001)
- Vue前端 (端口5173)
- WebSocket实时通信
- 审批弹窗系统

### 零配置使用
- 自动安装依赖
- 自动构建项目
- 自动配置Hook
- 开箱即用

## 🔄 版本更新

用户更新到新版本：
```bash
npm update -g aegis-security-monitor
```

开发者发布更新：
```bash
# 更新版本号
npm version patch  # 或 minor, major

# 发布新版本
npm publish
```

## 📊 优势对比

| 方案 | 安装复杂度 | 启动步骤 | 用户体验 |
|------|-----------|----------|----------|
| **v1.0** | 手动git clone | 多个命令 | 开发者级别 |
| **v2.0 CLI** | 一行命令 | 两个命令 | 普通用户 |

## 🎉 发布后的用户体验

**超简单3步使用**：
1. `npm install -g aegis-security-monitor` 
2. `aegis setup`
3. `aegis start`

**完整功能**：
- ✅ AI命令实时拦截
- ✅ 可视化审批界面
- ✅ 多AI工具支持
- ✅ 自定义安全规则
- ✅ 实时监控dashboard