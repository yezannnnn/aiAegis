#!/bin/bash

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 启动 Aegis v2.0 (NestJS + Vue)"
echo "=================================="
echo "📍 工作目录: $SCRIPT_DIR"

# 检查node_modules是否存在
if [ ! -d "backend/node_modules" ]; then
    echo "📦 安装后端依赖..."
    cd backend && npm install && cd "$SCRIPT_DIR"
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 安装前端依赖..."
    cd frontend && npm install && cd "$SCRIPT_DIR"
fi

echo "🔧 编译后端..."
cd backend && npm run build && cd "$SCRIPT_DIR"

echo "🌐 启动服务..."

# 启动后端服务
echo "🔧 启动后端服务..."
cd backend
npm run start:dev &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# 等待后端启动
sleep 5

# 启动前端服务
echo "🖥️ 启动前端服务..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"

echo ""
echo "✅ 服务已启动:"
echo "   🔧 后端API: http://localhost:3001"
echo "   📚 API文档: http://localhost:3001/api"
echo "   🖥️ 前端界面: http://localhost:5173"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 捕获中断信号
trap 'echo ""; echo "🛑 正在停止服务..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT

# 等待用户中断
wait