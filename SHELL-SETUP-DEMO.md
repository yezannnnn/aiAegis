# 🚀 aegis setup 自动配置演示

## 🎯 一键配置所有Shell拦截功能

现在用户只需要运行一条命令，就能自动配置所有Shell拦截功能！

## 📋 完整配置流程

### 1. 运行自动配置
```bash
cd aegis
aegis setup
```

### 2. 配置过程展示
```
🛡 Aegis Setup

  Detecting Agent CLIs...
    ✓ claude-code
    ✗ hermes
    ✗ openclaw
    ✗ codex
    ✗ cursor

  ✓ Config written: ~/.aegis/config.json

  Configuring shell environment...
    ✓ Shell profile updated: ~/.zshrc
    Run 'source ~/.zshrc' or restart terminal

  🔧 配置Shell命令拦截...
    ✅ 创建目录: ~/.aegis
    ✅ 创建目录: ~/.aegis/shell
    🔍 检测到当前Shell: zsh
    ✅ 生成拦截脚本: ~/.aegis/shell/aegis-functions.sh
    ✅ 更新 zsh 配置: ~/.zshrc
    ✅ 生成帮助脚本: ~/.aegis/enable-protection.sh, ~/.aegis/test-protection.sh
    ✅ Shell集成测试通过

📋 下一步操作:
   1. 重新启动终端或运行: source ~/.bashrc
   2. 启动Aegis监控: aegis monitor
   3. 测试保护: ~/.aegis/test-protection.sh

💡 使用方式:
   • 正常使用命令，危险操作会被拦截
   • 临时禁用: export AEGIS_ENABLED=0
   • 重新启用: source ~/.aegis/enable-protection.sh

📋 Summary:
  Daemon: 127.0.0.1:9876
  Agents enabled: claude-code
  Shell拦截: 已配置到 ~/.aegis/shell/

  📋 Next steps:
    1. 重启终端或运行: source ~/.bashrc
    2. 启动监控: aegis monitor
    3. 测试拦截: ~/.aegis/test-protection.sh

  💡 Claude Code已自动保护 (通过Shell拦截)
```

## 🗂️ 自动生成的文件结构

### Shell配置文件
```
~/.aegis/
├── config.json                    # Aegis主配置
├── shell/
│   ├── aegis-functions.sh         # Shell拦截函数
│   └── aegis-functions.fish       # Fish Shell支持
├── enable-protection.sh           # 快速启用脚本
└── test-protection.sh             # 测试脚本
```

### Shell配置自动修改
```bash
# ~/.bashrc 或 ~/.zshrc 自动添加:
# Aegis Shell Integration
# 自动生成于 2024-04-30T14:XX:XX.XXXZ
export AEGIS_ENABLED=1
source ~/.aegis/shell/aegis-functions.sh

# 启用Aegis的别名
alias claude-safe='AEGIS_ENABLED=1 claude'
alias aegis-enable='export AEGIS_ENABLED=1'
alias aegis-disable='export AEGIS_ENABLED=0'
```

## 🧪 自动测试功能

### 运行自动测试
```bash
~/.aegis/test-protection.sh
```

### 测试输出
```
🧪 测试Aegis保护...

测试命令拦截 (应该显示函数):
git is a function
git ()
{
    if aegis_check_command "git $*"; then
        command git "$@";
    fi
}

测试环境变量:
AEGIS_ENABLED=1
```

## 🎮 实际使用演示

### 1. 重启终端后自动加载
```bash
# 新终端自动显示
🛡️ Aegis Shell保护已启用
```

### 2. Claude Code自动保护
```bash
claude
# 用户: 强制推送到主分支
# Claude执行: git push --force origin main

🛡️ Aegis: 命令被阻止 - git push --force origin main
💡 在Aegis Monitor中查看详细信息
```

### 3. 临时禁用保护
```bash
export AEGIS_ENABLED=0
git push --force origin main  # 正常执行，无拦截
```

### 4. 重新启用保护
```bash
source ~/.aegis/enable-protection.sh
🛡️ Aegis保护已启用
💡 在新的shell会话中生效
```

## 🔧 高级配置选项

### 仅配置Shell拦截
```bash
aegis setup --shell-only
```

### 支持的Shell类型
- ✅ **Bash** - 自动配置 ~/.bashrc
- ✅ **Zsh** - 自动配置 ~/.zshrc
- ✅ **Fish** - 自动配置 ~/.config/fish/config.fish
- ⏳ **PowerShell** - Windows支持计划中

### 跨平台支持
- ✅ **macOS** - 完整支持
- ✅ **Linux** - 完整支持
- 🔨 **Windows** - 开发中

## 🛠️ 故障排除

### 问题: Shell拦截不生效
**检查步骤**:
```bash
# 1. 检查环境变量
echo $AEGIS_ENABLED

# 2. 检查函数是否加载
type git

# 3. 手动加载
source ~/.aegis/shell/aegis-functions.sh

# 4. 重新配置
aegis setup --shell-only
```

### 问题: 配置文件冲突
**解决方案**:
```bash
# 查看现有配置
grep -n "Aegis" ~/.bashrc ~/.zshrc

# 清理重复配置
sed -i '/# Aegis Shell Integration/,/^$/d' ~/.bashrc

# 重新配置
aegis setup --shell-only
```

## 🎉 核心优势

1. **零配置** - 一条命令完成所有设置
2. **智能检测** - 自动识别Shell和平台
3. **持久化** - 重启终端自动生效
4. **可控制** - 随时启用/禁用保护
5. **自测试** - 内置测试验证功能

---

**🎯 现在用户只需运行 `aegis setup`，就能获得企业级的Shell命令保护！**