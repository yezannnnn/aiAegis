#!/bin/bash

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📦 安装 Aegis v2.0 依赖"
echo "======================="

echo "🔧 安装后端依赖..."
cd backend
npm install

echo "🖥️ 安装前端依赖..."
cd ../frontend
npm install

echo "✅ 依赖安装完成！"
echo "运行 ./start.sh 启动服务"