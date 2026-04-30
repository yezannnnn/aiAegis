#!/bin/bash
# Aegis保护的Claude Code启动器
#
# 用法: ./claude-with-aegis.sh [claude参数...]
#
# 示例:
#   ./claude-with-aegis.sh                    # 启动Claude Code
#   ./claude-with-aegis.sh --model opus      # 启动并指定模型

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🛡️ 启动Aegis保护的Claude Code"
echo ""

# 检查Claude Code是否安装
if ! command -v claude &> /dev/null; then
    echo "❌ 错误: 未找到Claude Code"
    echo "   请先安装: npm install -g @anthropic/claude"
    exit 1
fi

# 检查依赖工具
missing_deps=()
if ! command -v nc &> /dev/null; then
    missing_deps+=("netcat")
fi
if ! command -v jq &> /dev/null; then
    missing_deps+=("jq")
fi

if [ ${#missing_deps[@]} -gt 0 ]; then
    echo "❌ 缺少依赖工具: ${missing_deps[*]}"
    echo "   安装方法:"
    for dep in "${missing_deps[@]}"; do
        case "$dep" in
            netcat)
                echo "     brew install netcat  # macOS"
                echo "     apt install netcat   # Ubuntu"
                ;;
            jq)
                echo "     brew install jq      # macOS"
                echo "     apt install jq       # Ubuntu"
                ;;
        esac
    done
    exit 1
fi

# 检查Aegis Daemon是否运行
echo "🔍 检查Aegis Daemon状态..."
if nc -z localhost 9876 2>/dev/null; then
    echo "✅ Aegis Daemon运行正常 (端口9876)"
else
    echo "⚠️  Aegis Daemon未运行，正在启动..."

    # 检查aegis命令是否可用
    if ! command -v aegis &> /dev/null; then
        echo "❌ 错误: 未找到aegis命令"
        echo "   请先安装: npm install -g aegis"
        echo "   或者在另一个终端手动启动: aegis monitor"
        exit 1
    fi

    # 在后台启动aegis monitor
    echo "   执行: aegis monitor &"
    aegis monitor &
    AEGIS_PID=$!

    # 等待daemon启动
    echo "   等待Daemon启动..."
    for i in {1..10}; do
        if nc -z localhost 9876 2>/dev/null; then
            echo "✅ Aegis Daemon启动成功"
            break
        fi
        if [ $i -eq 10 ]; then
            echo "❌ Aegis Daemon启动失败"
            echo "   请手动启动: aegis monitor"
            exit 1
        fi
        sleep 1
        echo -n "."
    done
    echo ""
fi

# 设置拦截环境变量
echo "🔧 配置拦截环境..."
export AEGIS_ENABLED=1
export BASH_ENV="$SCRIPT_DIR/claude-wrapper.sh"
export AEGIS_DEBUG=1

# 验证拦截器文件存在
if [ ! -f "$BASH_ENV" ]; then
    echo "❌ 错误: 拦截器文件不存在: $BASH_ENV"
    exit 1
fi

echo "✅ 拦截器配置完成"
echo ""

# 显示启动信息
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 启动Claude Code (带Aegis保护)"
echo ""
echo "📋 拦截的命令类型:"
echo "   • Git操作 (git push --force, git reset --hard)"
echo "   • 文件删除 (rm -rf)"
echo "   • 数据库操作 (mysql DROP, psql DELETE)"
echo "   • 系统权限 (sudo, chmod)"
echo "   • 容器操作 (docker run --privileged)"
echo ""
echo "💡 使用方式:"
echo "   1. 正常使用Claude Code"
echo "   2. 高危命令会触发Aegis审批"
echo "   3. 在Aegis Monitor中做决定"
echo "   4. 按 Ctrl+C 退出"
echo ""
echo "🔗 相关终端:"
echo "   • Aegis Monitor: 查看审批请求"
echo "   • 此终端: Claude Code交互"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 启动Claude Code
echo "🎯 启动Claude Code..."
exec claude "$@"