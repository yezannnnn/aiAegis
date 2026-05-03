#!/bin/bash

echo "🛡️ Aegis Hook集成演示"
echo "====================="

# 测试不同风险级别的命令
echo ""
echo "🧪 测试命令拦截效果："

# 安全命令 - 应该直接通过
echo ""
echo "1️⃣ 测试安全命令 (ls -la):"
echo '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' | node ~/.aegis/universal-hook.js

# 中等风险 - 应该触发审批
echo ""
echo "2️⃣ 测试需要审批命令 (rm -rf /tmp/test):"
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/test"}}' | node ~/.aegis/universal-hook.js

# 高风险 - 应该直接阻止
echo ""
echo "3️⃣ 测试危险命令 (rm -rf /):"
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | node ~/.aegis/universal-hook.js

echo ""
echo "💡 说明："
echo "- 安全命令直接通过，不发送到监控系统"
echo "- 中等风险命令发送审批请求，等待用户确认"
echo "- 危险命令直接阻止，返回安全提示"
echo ""
echo "🔧 配置文件位置："
echo "- Hook文件: ~/.aegis/universal-hook.js"
echo "- 规则配置: ~/.aegis/aegis-rules.yaml"
echo "- Claude设置: ~/.config/claude-code/settings.json"