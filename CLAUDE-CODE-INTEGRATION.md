# 🔗 Claude Code集成方案

## 🎯 集成目标

让Aegis拦截Claude Code中agents执行的高危命令，包括：
- Bash工具调用的系统命令
- Git操作、文件删除、数据库操作等
- 提供实时审批和安全建议

## 🔍 Claude Code命令执行分析

### 当前Claude Code架构
```
用户消息 → Claude Agent → Bash工具 → 系统命令执行
```

### 拦截点选择
需要在 **Bash工具执行前** 进行拦截，避免危险命令直接执行。

## 🚀 集成方案设计

### 方案1: Shell Wrapper (推荐 ⭐)
**原理**: 重写关键shell命令，重定向到Aegis检查

```bash
# ~/.aegis/claude-wrapper.sh
#!/bin/bash

# 拦截危险命令
function git() {
    aegis-check "git $*" && command git "$@"
}

function rm() {
    aegis-check "rm $*" && command rm "$@"
}

function mysql() {
    aegis-check "mysql $*" && command mysql "$@"
}

# 启动Claude Code时加载
export BASH_ENV="$HOME/.aegis/claude-wrapper.sh"
```

### 方案2: Process Monitor
**原理**: 监控Claude Code进程，拦截子进程启动

```typescript
// aegis-process-monitor.ts
class ClaudeCodeMonitor {
  async monitorClaudeProcess() {
    // 监控claude进程
    const claudeProc = findProcess('claude');

    // Hook子进程启动
    claudeProc.on('spawn', (command, args) => {
      const fullCommand = `${command} ${args.join(' ')}`;
      return this.checkWithAegis(fullCommand);
    });
  }
}
```

### 方案3: Environment Hook
**原理**: 通过环境变量和PATH修改拦截命令

```bash
# ~/.aegis/bin/git (拦截脚本)
#!/bin/bash
ORIGINAL_COMMAND="git $*"
aegis-check "$ORIGINAL_COMMAND"
if [ $? -eq 0 ]; then
    exec /usr/bin/git "$@"
else
    echo "❌ Command blocked by Aegis"
    exit 1
fi
```

## 💻 实施方案 (Shell Wrapper)

### 1. 创建Claude Code启动脚本
```bash
#!/bin/bash
# claude-with-aegis.sh

# 确保Aegis Daemon运行
if ! pgrep -f "aegis monitor" > /dev/null; then
    echo "⚠️  Aegis Monitor不在运行，启动中..."
    aegis monitor &
    sleep 2
fi

# 设置拦截环境
export AEGIS_ENABLED=1
export BASH_ENV="$HOME/.aegis/claude-wrapper.sh"

# 启动Claude Code
exec claude "$@"
```

### 2. 创建命令拦截器
```bash
#!/bin/bash
# ~/.aegis/claude-wrapper.sh

# Aegis拦截函数
aegis_check() {
    if [ "$AEGIS_ENABLED" != "1" ]; then
        return 0  # 未启用时直接通过
    fi

    local command="$1"
    local response

    # 发送到Aegis Daemon检查
    response=$(echo "$command" | nc localhost 9876)

    case "$response" in
        *"ALLOW"*)
            return 0 ;;
        *"DENY"*|*"BLOCK"*)
            echo "🛡️ Aegis: 命令被阻止 - $command"
            echo "原因: $(echo "$response" | jq -r '.reason')"
            return 1 ;;
        *)
            echo "⚠️ Aegis: 检查失败，默认允许"
            return 0 ;;
    esac
}

# 重写危险命令
git() {
    aegis_check "git $*" && command git "$@"
}

rm() {
    aegis_check "rm $*" && command rm "$@"
}

mysql() {
    aegis_check "mysql $*" && command mysql "$@"
}

psql() {
    aegis_check "psql $*" && command psql "$@"
}

docker() {
    aegis_check "docker $*" && command docker "$@"
}

sudo() {
    aegis_check "sudo $*" && command sudo "$@"
}

chmod() {
    aegis_check "chmod $*" && command chmod "$@"
}

# 导出函数到子shell
export -f git rm mysql psql docker sudo chmod aegis_check
```

### 3. 创建Aegis检查客户端
```bash
#!/bin/bash
# /usr/local/bin/aegis-check

COMMAND="$1"
REQUEST_ID=$(uuidgen)

# 构造请求
REQUEST_JSON=$(cat <<EOF
{
  "type": "approval_request",
  "payload": {
    "id": "$REQUEST_ID",
    "command": "$COMMAND",
    "cwd": "$(pwd)",
    "agentType": "claude-code",
    "sessionKey": "claude-session-$(date +%s)",
    "timestamp": $(date +%s000)
  }
}
EOF
)

# 发送到Aegis Daemon并等待响应
echo "$REQUEST_JSON" | nc localhost 9876
```

## 🧪 快速测试

### 1. 安装集成脚本
```bash
# 创建目录
mkdir -p ~/.aegis/bin

# 复制脚本文件
cp claude-wrapper.sh ~/.aegis/
cp aegis-check /usr/local/bin/
chmod +x /usr/local/bin/aegis-check
chmod +x ~/.aegis/claude-wrapper.sh

# 创建启动脚本
cat > ~/claude-with-aegis.sh << 'EOF'
#!/bin/bash
export AEGIS_ENABLED=1
export BASH_ENV="$HOME/.aegis/claude-wrapper.sh"
exec claude "$@"
EOF
chmod +x ~/claude-with-aegis.sh
```

### 2. 启动保护的Claude Code
```bash
# 终端1: 启动Aegis Monitor
aegis monitor

# 终端2: 启动保护的Claude Code
~/claude-with-aegis.sh
```

### 3. 测试拦截功能
在Claude Code中尝试执行：
```
用户: 删除临时文件
Claude: 我来删除临时文件...
[Bash调用] rm -rf /tmp/*

🛡️ Aegis拦截提示！
📊 风险级别: HIGH
🌍 环境: 生产环境，管理员权限
💡 建议: 先检查文件内容，使用 trash 命令
```

## 🎛️ 高级配置

### 仅拦截高危命令
```bash
# ~/.aegis/claude-config.sh
AEGIS_HIGH_RISK_COMMANDS="git rm mysql psql docker sudo"
AEGIS_MONITOR_ALL="false"  # 仅监控指定命令
```

### 自动批准模式
```bash
# 对特定项目路径自动批准
AEGIS_AUTO_APPROVE_PATHS="/Users/yuhao/safe-projects/*"
```

## 🔧 故障排除

### 检查拦截是否生效
```bash
# 在Claude Code中运行
echo $BASH_ENV  # 应该显示 ~/.aegis/claude-wrapper.sh
type git       # 应该显示是函数而不是原始命令
```

### Debug模式
```bash
export AEGIS_DEBUG=1  # 启用详细日志
```

---

**🎯 集成后效果**: Claude Code中的每个危险命令都会触发Aegis审批流程，用户可以看到完整的上下文分析并做出明智决定。