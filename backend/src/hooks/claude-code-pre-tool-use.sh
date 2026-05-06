#!/bin/bash
# ============================================================
# Claude Code preToolUse Hook — Aegis v2 双向审批集成
# ============================================================
# 安装方式：
#   1. 复制到 ~/.claude-code/hooks/pre_tool_use.sh
#   2. chmod +x ~/.claude-code/hooks/pre_tool_use.sh
#   3. 在 Claude Code 设置中启用 preToolUse hook
#
# 工作流程：
#   1. 提取命令 → 发送 Aegis 评估
#   2. 如果 allow → 直接放行
#   3. 如果 review → 创建审批请求 → 轮询等待用户决策
#   4. 如果 block → 直接拒绝
# ============================================================

set -euo pipefail

# 配置
AEGIS_URL="${AEGIS_URL:-http://localhost:3001}"
TIMEOUT="${AEGIS_TIMEOUT:-60}"
POLL_INTERVAL="${AEGIS_POLL_INTERVAL:-1}"

# 颜色
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# ============================================================
# 从 stdin 读取 Claude Code 传入的 JSON
# ============================================================
read -r -d '' INPUT_JSON || true

# 提取 tool 名称和参数
tool_name=$(echo "$INPUT_JSON" | jq -r '.tool_name // empty')
tool_input=$(echo "$INPUT_JSON" | jq -r '.tool_input // empty')

# 只拦截 Bash 工具
if [[ "$tool_name" != "Bash" ]]; then
    echo "$INPUT_JSON"
    exit 0
fi

# 提取命令
command=$(echo "$tool_input" | jq -r '.command // empty')
if [[ -z "$command" ]]; then
    echo "$INPUT_JSON"
    exit 0
fi

# ============================================================
# 发送到 Aegis 规则引擎评估
# ============================================================
echo -e "${YELLOW}[Aegis] 评估命令: $command${NC}" >&2

eval_response=$(curl -s -X POST "$AEGIS_URL/api/v1/rules/evaluate" \
    -H "Content-Type: application/json" \
    -d "{\"command\": \"$command\", \"cwd\": \"$(pwd)\"}") || {
    echo -e "${RED}[Aegis] 后端连接失败，放行命令${NC}" >&2
    echo "$INPUT_JSON"
    exit 0
}

# 解析评估结果
action=$(echo "$eval_response" | jq -r '.evaluation.action // "allow"')
reason=$(echo "$eval_response" | jq -r '.evaluation.reason // "无说明"')
severity=$(echo "$eval_response" | jq -r '.evaluation.severity // "off"')
risk_score=$(echo "$eval_response" | jq -r '.evaluation.riskScore // 0')
requires_approval=$(echo "$eval_response" | jq -r '.requiresApproval // false')
approval_request_id=$(echo "$eval_response" | jq -r '.approvalRequestId // empty')

# ============================================================
# 根据 action 处理
# ============================================================

case "$action" in
    "allow")
        echo -e "${GREEN}[Aegis] ✓ 命令已放行 (风险分: $risk_score)${NC}" >&2
        echo "$INPUT_JSON"
        exit 0
        ;;

    "block")
        echo -e "${RED}[Aegis] ✗ 命令被阻止: $reason${NC}" >&2
        # 返回修改后的 JSON，让 Claude Code 知道命令被拒绝
        echo "$INPUT_JSON" | jq '{
            tool_name: .tool_name,
            tool_input: .tool_input,
            aegis_decision: "blocked",
            aegis_reason: "'$reason'"
        }'
        exit 1
        ;;

    "review"|"deny")
        echo -e "${YELLOW}[Aegis] ⚠ 命令需审批: $reason${NC}" >&2
        echo -e "${YELLOW}[Aegis] 审批ID: $approval_request_id${NC}" >&2

        if [[ -z "$approval_request_id" ]]; then
            echo -e "${RED}[Aegis] 审批请求创建失败，阻止命令${NC}" >&2
            exit 1
        fi

        # ============================================================
        # 轮询等待用户决策
        # ============================================================
        elapsed=0
        while [[ $elapsed -lt $TIMEOUT ]]; do
            decision_response=$(curl -s "$AEGIS_URL/api/v1/approvals/wait/$approval_request_id" || echo '{"success":false}')
            status=$(echo "$decision_response" | jq -r '.approval.status // "pending"')

            if [[ "$status" == "approved" ]]; then
                echo -e "${GREEN}[Aegis] ✓ 审批通过，放行命令${NC}" >&2
                echo "$INPUT_JSON"
                exit 0
            elif [[ "$status" == "denied" ]]; then
                deny_reason=$(echo "$decision_response" | jq -r '.approval.reason // "用户拒绝"')
                echo -e "${RED}[Aegis] ✗ 审批被拒绝: $deny_reason${NC}" >&2
                exit 1
            fi

            sleep "$POLL_INTERVAL"
            elapsed=$((elapsed + POLL_INTERVAL))
            echo -e "${YELLOW}[Aegis] 等待审批中... (${elapsed}s/${TIMEOUT}s)${NC}" >&2
        done

        echo -e "${RED}[Aegis] 审批等待超时，阻止命令${NC}" >&2
        exit 1
        ;;

    *)
        echo -e "${YELLOW}[Aegis] 未知 action: $action，默认放行${NC}" >&2
        echo "$INPUT_JSON"
        exit 0
        ;;
esac
