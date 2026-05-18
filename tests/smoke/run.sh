#!/bin/bash
# Aegis 冒烟测试快速运行脚本
# 用法: ./run.sh [P0|P1|P2] [headless]

SKILL_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)/aiGroup/kyle/skills/playwright"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/aegis-smoke-test.js"

# 参数解析
FILTER="${1:-}"
HEADLESS_FLAG="${2:-}"

if [ -n "$FILTER" ]; then
  export FILTER="$FILTER"
fi

if [ "$HEADLESS_FLAG" = "headless" ]; then
  export HEADLESS=true
fi

echo "▶ Aegis 冒烟测试"
echo "  Skill目录: $SKILL_DIR"
echo "  测试脚本: $SCRIPT"
echo ""

if [ ! -d "$SKILL_DIR" ]; then
  echo "❌ 找不到 Playwright skill 目录: $SKILL_DIR"
  echo "   请确认 aiGroup/kyle/skills/playwright 存在"
  exit 1
fi

cd "$SKILL_DIR" && node run.js "$SCRIPT"
