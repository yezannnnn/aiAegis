#!/bin/bash
# =========================================================================
# Aegis Rule Tester — 单规则文件测试
#
# 用法:
#   ./test-rule.sh react.yaml              # 跑 YAML 里定义的 tests
#   ./test-rule.sh react.yaml --watch      # 交互模式，手动输入命令测
#   ./test-rule.sh react.yaml --cmd "npm install"  # 测单条命令
# =========================================================================

set +e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RULES_DIR="${SCRIPT_DIR}/src/rules"
PORT="${AEGIS_PORT:-3001}"
HOST="127.0.0.1"

RED='\033[31m'; GREEN='\033[32m'; YELLOW='\033[33m'; CYAN='\033[36m'
BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

# ── helpers ──────────────────────────────────────────────────────────────

die() { echo -e "${RED}$*${RESET}"; exit 1; }
ok()  { echo -e "  ${GREEN}✓${RESET} $*"; }
fail() { echo -e "  ${RED}✗${RESET} $*"; }

check_backend() {
  curl -s -o /dev/null "http://${HOST}:${PORT}/api/monitoring/health" 2>/dev/null || \
    die "❌ 后端未启动 (port ${PORT})，先启动: cd backend && npm run start:dev"
}

ensure_rule_loaded() {
  local rule_id="$1"
  local rules
  rules=$(curl -s "http://${HOST}:${PORT}/api/v1/rules" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); [print(r['id']) for r in d.get('rules',[])]" 2>/dev/null)
  echo "$rules" | grep -qF "$rule_id" && return 0
  die "❌ 规则 '$rule_id' 未加载。请重启后端加载新 YAML: cd backend && npm run start:dev"
}

# ── 核心：测一条命令 ────────────────────────────────────────────────────

evaluate_one() {
  local cmd="$1"
  local expect="${2:-}"  # allow | review | block | deny | 空=不验证

  local json_body resp
  json_body=$(python3 -c "
import json, sys
print(json.dumps({'command': sys.argv[1], 'sessionId': 'rule-tester', 'agentType': 'claude-code'}))
" "$cmd" 2>/dev/null)

  resp=$(curl -s -X POST "http://${HOST}:${PORT}/api/v1/rules/evaluate" \
    -H "Content-Type: application/json" -d "$json_body" 2>/dev/null)

  local action matchedRules severity reason
  action=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('evaluation',{}).get('action','?'))" 2>/dev/null)
  matchedRules=$(echo "$resp" | python3 -c "import sys,json; print(','.join(json.load(sys.stdin).get('evaluation',{}).get('matchedRules',[])))" 2>/dev/null)
  severity=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('evaluation',{}).get('severity','?'))" 2>/dev/null)
  reason=$(echo "$resp" | python3 -c "import sys,json; e=json.load(sys.stdin).get('evaluation',{}); print(e.get('reason','-'))" 2>/dev/null)

  echo -e "  命令: ${YELLOW}${cmd}${RESET}"
  echo -e "  AST:  $(echo "$resp" | python3 -c "
import sys,json
a=json.load(sys.stdin).get('ast',{})
print(f'binary={a.get(\"binary\",\"?\")}  sub=[{\" \".join(a.get(\"subcommands\",[]))}]  args=[{\" \".join(x[\"value\"] for x in a.get(\"arguments\",[]))}]  flags=[{\" \".join(f[\"raw\"] for f in a.get(\"flags\",[]))}]')
" 2>/dev/null)"

  if [ -n "$matchedRules" ]; then
    echo -e "  命中: ${DIM}[${matchedRules}]${RESET}  severity=${severity}  reason=\"${reason:0:60}\""
  fi

  # 判断结果
  local result="$action"
  case "$action" in
    allow)   echo -e "  决策: ${GREEN}${BOLD}ALLOW${RESET}" ;;
    review)  echo -e "  决策: ${YELLOW}${BOLD}REVIEW${RESET}" ;;
    deny|block) echo -e "  决策: ${RED}${BOLD}${action^^}${RESET}" ;;
    *)       echo -e "  决策: ${DIM}${action}${RESET}" ;;
  esac

  # 验证期望
  if [ -n "$expect" ]; then
    if [ "$result" = "$expect" ]; then
      ok "期望 ${expect} → 通过"
      return 0
    else
      fail "期望 ${expect}，实际 ${result}"
      return 1
    fi
  fi
  return 0
}

# ── 跑 YAML 中定义的 tests 字段 ────────────────────────────────────────

run_yaml_tests() {
  local yaml_file="$1"

  if [ ! -f "$yaml_file" ]; then
    die "文件不存在: $yaml_file"
  fi

  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║  Aegis Rule Test: $(basename "$yaml_file")${RESET}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════╝${RESET}"
  echo ""

  # 解析 YAML 中的 tests
  local test_count
  test_count=$(python3 -c "
import yaml, sys, json
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
tests = data.get('tests', [])
for t in tests:
    print(json.dumps(t))
" "$yaml_file" 2>/dev/null)

  if [ -z "$test_count" ]; then
    echo -e "${YELLOW}⚠️  YAML 中没有定义 tests 字段${RESET}"
    echo -e "${DIM}  在 YAML 中添加:${RESET}"
    echo ""
    echo -e "  ${DIM}tests:${RESET}"
    echo -e "  ${DIM}  - command: \"npm install react-router\"${RESET}"
    echo -e "  ${DIM}    expect: review${RESET}"
    echo -e "  ${DIM}  - command: \"ls -la\"${RESET}"
    echo -e "  ${DIM}    expect: allow${RESET}"
    echo ""
    return 0
  fi

  # 确保规则已加载（取第一条规则的 id）
  local first_id
  first_id=$(python3 -c "
import yaml, sys
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
rules = data.get('rules', [])
print(rules[0].get('id', '') if rules else '')
" "$yaml_file" 2>/dev/null)

  if [ -n "$first_id" ]; then
    ensure_rule_loaded "$first_id"
  fi

  echo ""

  local passed=0 failed=0 total=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    total=$((total + 1))

    local cmd expect description
    cmd=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('command',''))")
    expect=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('expect',''))")
    description=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('description',''))")

    [ -n "$description" ] && echo -e "${BOLD}${description}${RESET}"
    evaluate_one "$cmd" "$expect"
    if [ $? -eq 0 ]; then passed=$((passed+1)); else failed=$((failed+1)); fi
    echo ""
  done <<< "$test_count"

  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -ne "${BOLD}  结果: ${total} 条  "
  [ $passed -gt 0 ] && echo -ne "${GREEN}✓ ${passed} 通过${RESET}  "
  [ $failed -gt 0 ] && echo -ne "${RED}✗ ${failed} 失败${RESET}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

  if [ $failed -eq 0 ] && [ $total -gt 0 ]; then
    echo -e "\n${GREEN}${BOLD}✅ 全部通过！此规则可以发布${RESET}"
  else
    echo -e "\n${RED}${BOLD}❌ 有 ${failed} 条失败，需修复后重新测试${RESET}"
  fi

  return $failed
}

# ── 交互模式 ────────────────────────────────────────────────────────────

interactive_mode() {
  local yaml_file="$1"
  echo -e "${CYAN}交互测试模式 — 输入命令观察规则匹配结果${RESET}"
  echo -e "${DIM}输入 'quit' 退出${RESET}"
  echo ""

  while true; do
    echo -ne "${GREEN}> ${RESET}"
    read -r cmd
    [ "$cmd" = "quit" ] || [ "$cmd" = "exit" ] || [ "$cmd" = "q" ] && break
    [ -n "$cmd" ] && evaluate_one "$cmd" "" && echo ""
  done
}

# ── main ─────────────────────────────────────────────────────────────────

check_backend

case "${2:-}" in
  --watch|-w|--interactive|-i)
    interactive_mode "$1"
    ;;
  --cmd|-c)
    cmd="${3:-}"
    [ -z "$cmd" ] && die "用法: $0 file.yaml --cmd 'command'"
    evaluate_one "$cmd" ""
    ;;
  *)
    run_yaml_tests "$1"
    ;;
esac
