#!/bin/bash
# Aegis Claude Code集成 - 命令拦截器
#
# 用法: 设置 export BASH_ENV="path/to/claude-wrapper.sh" 后启动Claude Code

# Aegis拦截函数
aegis_check() {
    if [ "$AEGIS_ENABLED" != "1" ]; then
        return 0  # 未启用时直接通过
    fi

    local command="$1"
    local temp_file="/tmp/aegis-request-$$.json"
    local response_file="/tmp/aegis-response-$$.json"

    # 生成请求ID
    local request_id=$(date +%s)-$$

    # 构造请求JSON
    cat > "$temp_file" <<EOF
{
  "type": "approval_request",
  "payload": {
    "id": "$request_id",
    "command": "$command",
    "argv": $(printf '%s\n' $command | jq -R . | jq -s .),
    "cwd": "$(pwd)",
    "agentType": "claude-code",
    "sessionKey": "claude-session-$(date +%s)",
    "timestamp": $(date +%s000)
  }
}
EOF

    # 发送到Aegis Daemon (端口9876)
    if command -v nc >/dev/null 2>&1; then
        # 使用netcat发送请求并接收响应
        timeout 10 sh -c "cat '$temp_file' | nc localhost 9876" > "$response_file" 2>/dev/null
    else
        echo "⚠️ Aegis: 未找到nc命令，默认允许执行"
        rm -f "$temp_file" "$response_file"
        return 0
    fi

    # 检查响应
    if [ ! -s "$response_file" ]; then
        echo "⚠️ Aegis: 无法连接到Daemon (运行 'aegis monitor' 启动)"
        echo "   默认允许执行: $command"
        rm -f "$temp_file" "$response_file"
        return 0
    fi

    # 解析响应
    local decision=$(cat "$response_file" | jq -r '.payload.decision // .type' 2>/dev/null)

    # 清理临时文件
    rm -f "$temp_file" "$response_file"

    case "$decision" in
        "ALLOW"|"approval_resolution")
            return 0 ;;
        "DENY"|"denied")
            echo ""
            echo "🛡️ Aegis: 命令被阻止"
            echo "   命令: $command"
            echo "   原因: 安全策略拦截"
            echo ""
            echo "💡 在Aegis Monitor中查看详细信息并做出决定"
            echo "   或运行: aegis monitor"
            echo ""
            return 1 ;;
        *)
            if grep -q "blocked\|denied" "$response_file" 2>/dev/null; then
                echo "🛡️ Aegis: 命令被阻止 - $command"
                return 1
            else
                echo "⚠️ Aegis: 响应解析失败，默认允许"
                return 0
            fi ;;
    esac
}

# 重写高危命令 - Git操作
git() {
    if aegis_check "git $*"; then
        command git "$@"
    fi
}

# 重写高危命令 - 文件操作
rm() {
    if aegis_check "rm $*"; then
        command rm "$@"
    fi
}

# 重写高危命令 - 数据库操作
mysql() {
    if aegis_check "mysql $*"; then
        command mysql "$@"
    fi
}

psql() {
    if aegis_check "psql $*"; then
        command psql "$@"
    fi
}

# 重写高危命令 - 容器操作
docker() {
    if aegis_check "docker $*"; then
        command docker "$@"
    fi
}

# 重写高危命令 - 权限操作
sudo() {
    if aegis_check "sudo $*"; then
        command sudo "$@"
    fi
}

chmod() {
    if aegis_check "chmod $*"; then
        command chmod "$@"
    fi
}

chown() {
    if aegis_check "chown $*"; then
        command chown "$@"
    fi
}

# 重写高危命令 - 网络操作
curl() {
    if aegis_check "curl $*"; then
        command curl "$@"
    fi
}

wget() {
    if aegis_check "wget $*"; then
        command wget "$@"
    fi
}

# 重写高危命令 - 系统操作
systemctl() {
    if aegis_check "systemctl $*"; then
        command systemctl "$@"
    fi
}

service() {
    if aegis_check "service $*"; then
        command service "$@"
    fi
}

# 重写高危命令 - 包管理
npm() {
    # 只拦截可能危险的npm操作
    case "$1" in
        install|uninstall|update|publish|unpublish)
            if aegis_check "npm $*"; then
                command npm "$@"
            fi
            ;;
        *)
            command npm "$@"
            ;;
    esac
}

pip() {
    case "$1" in
        install|uninstall)
            if aegis_check "pip $*"; then
                command pip "$@"
            fi
            ;;
        *)
            command pip "$@"
            ;;
    esac
}

# 导出函数到子shell (重要!)
export -f aegis_check
export -f git rm mysql psql docker sudo chmod chown curl wget systemctl service npm pip

# 显示拦截状态 (仅在交互式shell中)
if [ "$AEGIS_DEBUG" = "1" ]; then
    echo "🛡️ Aegis Claude Code集成已启用"
    echo "   拦截的命令: git, rm, mysql, docker, sudo等"
    echo "   Daemon状态: $(nc -z localhost 9876 && echo '✅ 运行中' || echo '❌ 未运行')"
fi