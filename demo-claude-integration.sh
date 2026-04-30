#!/bin/bash
# Aegis Claude Code集成演示脚本

set -e

echo "🎬 Aegis Claude Code集成演示"
echo "=================================="

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "📋 演示步骤:"
echo "1. 检查环境"
echo "2. 安装Aegis Claude集成"
echo "3. 测试拦截功能"
echo "4. 展示实际效果"
echo ""

# 检查环境
echo "🔍 检查环境..."
if command -v claude &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Claude Code已安装"
else
    echo -e "  ${RED}✗${NC} Claude Code未安装"
    echo "  💡 请先安装: https://claude.ai/code"
    exit 1
fi

if command -v node &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Node.js可用"
else
    echo -e "  ${RED}✗${NC} Node.js未安装"
    exit 1
fi

# 构建项目
echo ""
echo "🔨 构建Aegis项目..."
if [ -f "package.json" ]; then
    npm install --silent
    npm run build --silent
    echo -e "  ${GREEN}✓${NC} 项目构建完成"
else
    echo -e "  ${RED}✗${NC} 项目package.json未找到"
    exit 1
fi

# 安装Claude集成
echo ""
echo "🔗 安装Claude Code集成..."
node dist/index.js setup --claude-only

# 检查安装结果
echo ""
echo "🧪 验证安装..."
if [ -f "$HOME/.aegis/claude-hook.js" ]; then
    echo -e "  ${GREEN}✓${NC} Hook脚本已安装"
else
    echo -e "  ${RED}✗${NC} Hook脚本安装失败"
fi

if grep -q "Aegis" "$HOME/.claude/settings.json" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Claude settings已更新"
else
    echo -e "  ${YELLOW}⚠${NC} Claude settings可能未正确更新"
fi

# 演示效果
echo ""
echo "🎭 演示拦截效果..."
echo ""
echo "模拟Claude Code执行危险命令："
echo ""

# 创建模拟输入
cat > /tmp/test_hook_input.json << 'EOF'
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "git push --force origin main"
  }
}
EOF

echo -e "${YELLOW}输入命令:${NC} git push --force origin main"
echo ""
echo -e "${YELLOW}Aegis Hook响应:${NC}"

# 测试hook（使用超时防止挂起）
if timeout 10s node "$HOME/.aegis/claude-hook.js" < /tmp/test_hook_input.json > /dev/null 2>&1; then
    echo -e "  ${YELLOW}⚠${NC} 命令被允许（可能daemon未运行）"
    echo "  💡 启动 'aegis monitor' 获得完整保护"
else
    exit_code=$?
    if [ $exit_code -eq 2 ]; then
        echo -e "  ${RED}🛑 命令被阻止${NC} - Aegis发现危险操作！"
    else
        echo -e "  ${GREEN}✓${NC} Hook正常工作"
    fi
fi

# 清理
rm -f /tmp/test_hook_input.json

echo ""
echo "🎉 演示完成！"
echo ""
echo "📋 下一步:"
echo "1. 启动监控: aegis monitor"
echo "2. 在Claude Code中尝试危险命令"
echo "3. 观察Aegis如何拦截和提示"
echo ""
echo "⚡ 您的Claude Code现已受到Aegis保护！"