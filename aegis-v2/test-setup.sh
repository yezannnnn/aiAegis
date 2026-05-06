#!/bin/bash

echo "🧪 测试Aegis CLI安装流程"
echo "========================="

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 模拟全局安装测试
echo "📦 模拟安装依赖..."
cd bin
npm install commander chalk ora inquirer fs-extra cross-spawn

echo "🔧 测试setup命令..."
node aegis.js setup --skip-deps --skip-hook

echo "📋 测试config命令..."
node aegis.js config --list

echo "🔗 测试hook状态..."
node aegis.js config --show-hook

echo "✅ CLI测试完成！"
echo ""
echo "下一步测试:"
echo "1. node aegis.js start (启动服务)"
echo "2. node aegis.js status (检查状态)"