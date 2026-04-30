# 🔗 Aegis Claude Code集成指南

Aegis现在支持与Claude Code无缝集成，自动拦截危险命令执行！

## 🚀 快速开始

### 1. 自动安装（推荐）

```bash
cd aegis
aegis setup
```

安装脚本会自动：
- ✅ 检测Claude Code安装
- ✅ 配置PreToolUse hook
- ✅ 更新Claude settings.json
- ✅ 测试集成有效性

### 2. 单独安装Claude集成

```bash
aegis setup --claude-only
```

仅配置Claude Code集成，跳过其他设置。

## 🔧 工作原理

### 集成架构

```
Claude Code执行命令
        ↓
Aegis PreToolUse Hook
        ↓
AST风险分析引擎
        ↓
Aegis Monitor (用户审批)
        ↓
允许/拒绝执行
```

### Hook机制

- **拦截点**: Claude Code的`Bash`工具执行前
- **数据源**: 完整命令字符串 + 执行上下文
- **决策**: 基于AST解析的智能风险评估
- **响应时间**: 5秒内（超时自动允许）

## 📋 使用场景示例

### ✅ 正常使用流程

```bash
# 1. 启动Aegis监控
aegis monitor

# 2. 在Claude Code中正常工作
# 安全命令自动通过，危险命令会被拦截
```

### 🛡️ 危险命令拦截

当Claude执行危险命令时：

```
用户: 强制推送代码到主分支
Claude: 执行 git push --force origin main

[Aegis] BLOCKED: 强制推送可能覆盖其他人的工作
[Aegis] Risk Level: HIGH (95/100)
[Aegis] Open Aegis Monitor to review and approve if needed
```

### 💡 智能上下文分析

Aegis会分析：
- **命令结构**: AST解析而非简单正则匹配
- **Git状态**: 当前分支、未提交更改、仓库类型
- **项目环境**: Node.js/Python/Go项目检测
- **系统状态**: 用户权限、平台信息

## ⚙️ 配置选项

### 1. 修改Hook设置

编辑 `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.aegis/claude-hook.js",
            "timeout": 5
          }
        ],
        "description": "Aegis safety check for dangerous Bash commands"
      }
    ]
  }
}
```

### 2. 调整超时时间

修改`timeout`值（秒）：
- `3`: 快速响应（可能误判）
- `5`: 平衡模式（推荐）
- `10`: 详细分析（较慢）

### 3. Fallback模式

当Aegis daemon未运行时，会使用基本规则检查：
- 强制推送: `git push --force`
- 危险删除: `rm -rf /`
- 权限操作: `sudo rm`
- 设备写入: `dd of=/dev/`

## 🧪 测试集成

### 运行测试脚本

```bash
# 进入aegis目录
cd aegis

# 编译TypeScript（如需要）
npm run build

# 运行测试
node dist/integrations/test-claude-integration.js
```

### 手动测试

在Claude Code中尝试执行：

```bash
# 应该被阻止
git push --force origin main
rm -rf package.json node_modules
sudo rm -rf /etc/hosts

# 应该被允许
ls -la
npm install
git status
```

## 🐛 故障排除

### 问题：Hook不生效

**检查步骤**：
1. 确认Claude Code版本支持hooks
2. 检查 `~/.claude/settings.json` 是否有Aegis配置
3. 验证 `~/.aegis/claude-hook.js` 文件存在且可执行
4. 查看Claude Code日志中的错误信息

**解决方案**：
```bash
# 重新安装集成
aegis setup --claude-only

# 手动验证hook语法
node ~/.aegis/claude-hook.js
```

### 问题：权限错误

**症状**: Hook script permission denied

**解决方案**:
```bash
chmod +x ~/.aegis/claude-hook.js
```

### 问题：网络连接失败

**症状**: 无法连接到Aegis daemon

**检查**:
```bash
# 确认daemon运行
netstat -an | grep 9876

# 启动monitoring
aegis monitor
```

### 问题：误报太多

**调整策略**:
1. 启动Aegis Monitor进行精确判断
2. 考虑调整AST规则敏感度
3. 使用白名单模式

## 📚 高级功能

### 1. 自定义规则

Hook脚本支持自定义基本规则：

```javascript
// 在 ~/.aegis/claude-hook.js 中添加
const customRules = [
  { pattern: /npm publish/, reason: '发布包需要确认' },
  { pattern: /docker.*--rm/, reason: '容器删除需要确认' }
];
```

### 2. 日志审计

Hook执行日志可在以下位置找到：
- Claude Code日志: `~/.claude/debug/`
- Aegis日志: Aegis Monitor界面

### 3. 性能优化

- Hook响应时间通常 < 100ms
- 网络超时设置为5秒
- 缓存机制减少重复分析

## 🔄 版本兼容性

| Claude Code版本 | Aegis版本 | Hook支持 | 状态 |
|-----------------|-----------|-----------|------|
| v0.5.0+ | v0.1.0+ | ✅ PreToolUse | 完全支持 |
| v0.4.x | v0.1.0+ | ⚠️ 部分支持 | 基本功能 |
| < v0.4.0 | - | ❌ 不支持 | 需要升级 |

## 💡 最佳实践

1. **常驻Monitor**: 保持`aegis monitor`运行以获得最佳保护
2. **定期更新**: 及时更新Aegis规则库
3. **团队协调**: 在团队中统一配置Aegis规则
4. **渐进部署**: 先在个人环境测试，再推广到团队
5. **日志审查**: 定期检查拦截日志，调优规则

---

## ❓ 需要帮助？

- 🐛 **Bug报告**: [GitHub Issues](https://github.com/your-repo/aegis/issues)
- 💬 **讨论**: [GitHub Discussions](https://github.com/your-repo/aegis/discussions)
- 📖 **文档**: [完整文档](./README.md)

**🎯 现在您的Claude Code已获得企业级安全保护！**