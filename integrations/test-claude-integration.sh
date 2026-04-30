#!/bin/bash
# Claude Code集成测试脚本
#
# 测试Aegis是否能正确拦截Claude Code中的危险命令

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧪 Aegis Claude Code集成测试"
echo "================================"
echo ""

# 检查依赖
echo "1️⃣ 检查依赖工具..."
missing_deps=()

if ! command -v nc &> /dev/null; then
    missing_deps+=("netcat")
fi
if ! command -v jq &> /dev/null; then
    missing_deps+=("jq")
fi

if [ ${#missing_deps[@]} -gt 0 ]; then
    echo "❌ 缺少依赖: ${missing_deps[*]}"
    echo "   请先安装依赖工具"
    exit 1
fi
echo "✅ 依赖检查通过"
echo ""

# 检查Aegis Daemon
echo "2️⃣ 检查Aegis Daemon..."
if nc -z localhost 9876 2>/dev/null; then
    echo "✅ Aegis Daemon运行正常"
else
    echo "❌ Aegis Daemon未运行"
    echo "   请在另一个终端启动: aegis monitor"
    exit 1
fi
echo ""

# 设置拦截环境
echo "3️⃣ 设置拦截环境..."
export AEGIS_ENABLED=1
export BASH_ENV="$SCRIPT_DIR/claude-wrapper.sh"

if [ ! -f "$BASH_ENV" ]; then
    echo "❌ 拦截器文件不存在: $BASH_ENV"
    exit 1
fi

echo "✅ 拦截环境设置完成"
echo "   AEGIS_ENABLED=$AEGIS_ENABLED"
echo "   BASH_ENV=$BASH_ENV"
echo ""

# 启动测试环境
echo "4️⃣ 启动测试Shell..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 测试环境已准备就绪"
echo ""
echo "🧪 测试命令 (会触发Aegis拦截):"
echo "   git push --force origin main"
echo "   rm -rf /tmp/test"
echo "   sudo chmod 777 /etc/passwd"
echo "   mysql -e \"DROP DATABASE test\""
echo ""
echo "🔍 安全命令 (不会被拦截):"
echo "   ls -la"
echo "   git status"
echo "   echo 'hello world'"
echo ""
echo "💡 输入命令进行测试，输入 'exit' 退出"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 启动交互式测试shell
bash --rcfile <(echo "source $BASH_ENV")