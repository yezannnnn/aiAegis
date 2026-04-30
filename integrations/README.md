# 🔗 Aegis × Claude Code 集成

保护Claude Code执行的危险命令，提供实时审批和安全建议。

## 🚀 快速开始

### 1. 安装依赖
```bash
# macOS
brew install netcat jq

# Ubuntu
apt install netcat jq
```

### 2. 启动保护的Claude Code
```bash
# 终端1: 启动Aegis Monitor
aegis monitor

# 终端2: 启动保护的Claude Code
./claude-with-aegis.sh
```

### 3. 测试集成效果
在Claude Code中尝试危险命令，会触发Aegis拦截：
```
用户: 强制推送代码到主分支
Claude: 我来执行 git push --force...

🛡️ Aegis: 命令被阻止
   命令: git push --force origin main
   原因: 安全策略拦截

💡 在Aegis Monitor中查看详细信息并做出决定
```

## 📁 文件说明

- **`claude-with-aegis.sh`** - 启动器脚本，自动配置保护环境
- **`claude-wrapper.sh`** - 核心拦截器，重写危险命令
- **`test-claude-integration.sh`** - 集成测试脚本

## 🎯 拦截的命令类型

### Git操作
- `git push --force` - 强制推送
- `git reset --hard` - 硬重置
- `git clean -fd` - 强制清理

### 文件操作
- `rm -rf` - 递归删除
- `chmod 777` - 权限修改
- `sudo rm` - 管理员删除

### 数据库操作
- `mysql DROP DATABASE` - 删除数据库
- `psql DELETE FROM` - 批量删除

### 系统操作
- `docker run --privileged` - 特权容器
- `systemctl stop` - 停止服务
- `sudo` - 管理员权限

## 🧪 测试步骤

### 1. 环境测试
```bash
./test-claude-integration.sh
```

### 2. 在测试shell中输入危险命令
```bash
git push --force origin main  # 应被拦截
rm -rf /tmp/test             # 应被拦截
ls -la                       # 应该通过
```

### 3. 观察Aegis Monitor
- 查看拦截请求的详细信息
- 使用新的上下文显示功能
- 按 `[I]` 查看完整分析

## ⚙️ 自定义配置

### 只拦截特定命令
编辑 `claude-wrapper.sh`，注释不需要的函数：
```bash
# git() { ... }           # 注释掉不拦截git
rm() { ... }              # 保留拦截rm
```

### 调试模式
```bash
export AEGIS_DEBUG=1
./claude-with-aegis.sh
```

### 临时禁用拦截
```bash
unset AEGIS_ENABLED
# 或者
export AEGIS_ENABLED=0
```

## 🔧 故障排除

### 问题: "未找到nc命令"
**解决**: 安装netcat
```bash
brew install netcat  # macOS
apt install netcat   # Ubuntu
```

### 问题: "无法连接到Daemon"
**解决**: 启动Aegis Monitor
```bash
aegis monitor
```

### 问题: 拦截不生效
**检查**:
1. 环境变量设置: `echo $BASH_ENV`
2. 函数是否加载: `type git`
3. Daemon是否运行: `nc -z localhost 9876`

### 问题: Claude Code无响应
**原因**: 命令被拦截等待审批
**解决**: 在Aegis Monitor中做出决定

## 📊 效果展示

### 拦截前
```
Claude: 我来删除临时文件
[直接执行] rm -rf /tmp/*
💥 文件被删除，无法撤销
```

### 拦截后
```
Claude: 我来删除临时文件
🛡️ Aegis拦截

📋 命令分析:
   主命令: rm | 选项: -rf | 目标: /tmp/*

🌍 环境上下文:
   项目: node | 系统: 管理员权限 ⚠️

⚡ 风险评估:
   级别: HIGH | 影响: 数据丢失, 不可逆

💡 建议: 先检查内容，使用 trash 命令

👤 用户决定: [A]允许 [D]拒绝 [I]详情
```

---

**🎯 现在Claude Code具备企业级安全防护，每个危险操作都有清晰的上下文分析！**