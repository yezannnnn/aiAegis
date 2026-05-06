# Aegis AI Hook集成

## 目录结构

```
hooks/
├── claude-code/           # Claude Code专用hooks
│   ├── universal-hook-v2.js  # 当前生产版本
│   └── universal-hook-v1.js  # 旧版本归档
├── hermes/               # Hermes AI支持（计划中）
├── shared/               # 共享组件和工具库
└── examples/             # Hook开发示例
```

## 支持的AI工具

| AI工具 | 状态 | Hook文件 |
|---------|------|----------|
| Claude Code | ✅ 已支持 | universal-hook-v2.js |
| Hermes | 🔮 计划中 | - |
| Cursor | 🔮 计划中 | - |
| Codeium | 🔮 计划中 | - |

## 安装使用

### Claude Code
```bash
# 安装当前版本
cp hooks/claude-code/universal-hook-v2.js ~/.aegis/

# 配置Claude Code settings.json
# 添加PreToolUse hook配置
```

### 开发新hook
1. 参考 `examples/` 中的示例
2. 使用 `shared/` 中的通用组件
3. 遵循统一的API规范

## 架构设计

### 统一流程
1. **命令拦截** - AI工具调用hook
2. **规则评估** - Aegis引擎分析风险
3. **决策执行** - 放行/审批/阻止
4. **状态同步** - 更新监控系统

### 扩展性
- 每个AI工具独立目录
- 共享核心逻辑复用
- 统一配置管理

## 贡献指南
- 新增AI支持请创建对应目录
- 共用组件放入shared/
- 更新此README文档