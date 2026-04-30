#!/bin/bash
# Aegis 简单模式启动脚本 - 避免TUI布局问题

echo "🛡️  启动 Aegis 简单模式监控..."
echo ""

# 检查是否有其他实例运行
if lsof -i :9876 &>/dev/null; then
    echo "⚠️  端口9876已被占用，正在停止现有进程..."
    # 杀掉占用端口的进程
    lsof -ti :9876 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# 启动简单模式监控
echo "🚀 启动简单模式监控（无TUI界面）..."
node dist/index.js monitor --simple

echo "👋 Aegis 监控已停止"