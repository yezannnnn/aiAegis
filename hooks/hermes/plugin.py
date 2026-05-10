#!/usr/bin/env python3
"""
Aegis Hermes Plugin Hook
拦截 terminal/Shell 工具调用，与 Aegis 后端规则引擎交互。

安装位置: ~/.hermes/plugins/aegis/plugin.py
"""

import json
import os
import sys
import time
import uuid
import urllib.request
import urllib.error
from pathlib import Path

# ============================================================================
# 配置
# ============================================================================

AEGIS_PORT = 3001  # 默认端口，Hook 脚本内固定（与 Claude Code Hook 一致）
CACHE_TTL = 300    # 5 分钟

def _load_aegis_lang():
    """从 ~/.aegis/config.json 读取语言设置，默认 zh"""
    config_path = Path.home() / ".aegis" / "config.json"
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        return config.get("lang", "zh")
    except Exception:
        return "zh"

# ============================================================================
# 缓存管理 — pre_llm_call 缓存 model 和 userInput
# ============================================================================

_CACHE = {}

def _get_cache_dir():
    """获取缓存目录"""
    cache_dir = Path.home() / ".aegis" / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir

def _cache_key(task_id):
    """生成缓存文件路径"""
    return _get_cache_dir() / f"{task_id}.json"

def _load_cache(task_id):
    """从文件加载缓存"""
    global _CACHE
    cache_file = _cache_key(task_id)
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            # TTL 检查
            if time.time() - data.get("timestamp", 0) < CACHE_TTL:
                _CACHE[task_id] = data
                return data
        except Exception:
            pass
    return _CACHE.get(task_id, {})

def _save_cache(task_id, data):
    """保存缓存到文件"""
    global _CACHE
    data["timestamp"] = time.time()
    _CACHE[task_id] = data
    try:
        cache_file = _cache_key(task_id)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception:
        pass

def _clear_cache(task_id):
    """清除缓存"""
    global _CACHE
    _CACHE.pop(task_id, None)
    try:
        cache_file = _cache_key(task_id)
        if cache_file.exists():
            cache_file.unlink()
    except Exception:
        pass

# ============================================================================
# Hermes 插件注册入口
# ============================================================================

def register(ctx):
    """
    Hermes 插件注册函数。
    通过 ctx.register_hook() 注册 pre_tool_call 和 pre_llm_call hooks。
    """
    ctx.register_hook("pre_tool_call", pre_tool_call)
    ctx.register_hook("pre_llm_call", pre_llm_call)

# ============================================================================
# pre_llm_call — 每轮 LLM 调用前缓存上下文
# ============================================================================

def pre_llm_call(session_id, user_message, conversation_history,
                 is_first_turn, model, platform, **kwargs):
    """每轮缓存 model 和 user_message"""
    _save_cache(session_id, {
        "model": model or "unknown",
        "userInput": user_message or "",
    })
    return None

# ============================================================================
# pre_tool_call — 拦截工具调用
# ============================================================================

def pre_tool_call(tool_name, args, task_id, **kwargs):
    """
    Hermes Plugin Hook 入口。
    拦截 terminal/Shell 工具调用，发送到 Aegis 后端评估。
    """
    # DEBUG: 记录调用次数和参数
    debug_file = os.path.expanduser("~/.aegis/hook-debug.log")
    try:
        with open(debug_file, "a") as f:
            f.write(f"[DEBUG] pre_tool_call called: tool_name={tool_name}, command={args.get('command', '')}, task_id={task_id}, kwargs_keys={list(kwargs.keys())}\n")
    except Exception:
        pass
    
    # 只拦截 Shell 相关工具（Hermes 可能用 terminal/exec/shell 等名称）
    if tool_name.lower() not in ("terminal", "shell", "exec", "spawn", "bash", "sh"):
        return None

    command = args.get("command", "")
    if not command:
        return None

    # Hermes 对每个工具调用触发两次 pre_tool_call：
    #   第1次：拦截检查（run_agent → get_pre_tool_call_block_message），tool_call_id=""
    #   第2次：observer 通知（model_tools skip=True 路径），tool_call_id=<真实ID>
    # 我们只处理第1次（拦截检查），第2次直接跳过。
    if kwargs.get('tool_call_id'):
        try:
            with open(debug_file, "a") as f:
                f.write(f"[DEBUG] observer call skipped (tool_call_id={kwargs['tool_call_id'][:8]}): {command}\n")
        except Exception:
            pass
        return None

    # 读取缓存
    cache = _load_cache(task_id)
    model = cache.get("model", "unknown")
    user_input = cache.get("userInput", "")

    # 组装 payload
    cwd = os.getcwd()
    request_id = f"req_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

    payload = {
        "command": command,
        "sessionId": task_id,
        "agentType": "hermes",
        "cwd": cwd,
        "model": model,
        "taskId": task_id,
        "userInput": user_input,
        "requestId": request_id,
        "lang": _load_aegis_lang(),
    }

    # 调用 Aegis 后端
    result = _evaluate_with_backend(payload)
    if not result:
        # 后端不可用，默认放行
        return None

    evaluation = result.get("evaluation", {})
    action = evaluation.get("action", "allow")

    if action in ("allow", "warn"):
        return None

    if action in ("deny", "block"):
        reason = evaluation.get("reason", "Blocked by rule")
        matched_rules = evaluation.get("matchedRules", [])
        rules_str = f" (rules: {', '.join(matched_rules)})" if matched_rules else ""
        return {
            "action": "block",
            "message": f"🛡️ Aegis blocked{rules_str}\nReason: {reason}\nCommand denied."
        }

    if action == "review":
        approval_id = result.get("approvalRequestId")
        reason = evaluation.get("reason", "Requires approval")
        matched_rules = evaluation.get("matchedRules", [])
        rules_str = f" (rules: {', '.join(matched_rules)})" if matched_rules else ""

        if not approval_id:
            return {
                "action": "block",
                "message": f"🛡️ Aegis blocked{rules_str}\nReason: {reason}\nError: failed to create approval request"
            }

        # Long-poll waiting for approval (max 60s)
        decision = _poll_for_approval(approval_id, 60)
        if decision and decision.get("status") == "approved":
            return None

        decision_reason = decision.get("reason", "Approval timed out") if decision else "Approval timed out"
        return {
            "action": "block",
            "message": f"🛡️ Aegis blocked{rules_str}\nReason: {reason}\nStatus: {decision_reason}\nApprove at http://localhost:{AEGIS_PORT} and retry"
        }

    # 未知 action，默认放行
    return None

# ============================================================================
# HTTP 通信（标准库 urllib，无额外依赖）
# ============================================================================

def _evaluate_with_backend(payload):
    """POST /api/v1/rules/evaluate"""
    # DEBUG: 记录评估请求
    debug_file = os.path.expanduser("~/.aegis/hook-debug.log")
    command = payload.get("command", "")
    try:
        with open(debug_file, "a") as f:
            f.write(f"[DEBUG] _evaluate_with_backend called: command={command}, requestId={payload.get('requestId', 'none')}\n")
    except Exception:
        pass
    
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"http://127.0.0.1:{AEGIS_PORT}/api/v1/rules/evaluate",
            data=data,
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(len(data)),
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status in (200, 201):
                result = json.loads(resp.read().decode("utf-8"))
                try:
                    with open(debug_file, "a") as f:
                        f.write(f"[DEBUG] _evaluate_with_backend result: action={result.get('evaluation', {}).get('action', 'unknown')}, approvalRequestId={result.get('approvalRequestId', 'none')}\n")
                except Exception:
                    pass
                return result
    except Exception as e:
        try:
            with open(debug_file, "a") as f:
                f.write(f"[DEBUG] _evaluate_with_backend error: {e}\n")
        except Exception:
            pass
    return None

def _poll_for_approval(approval_id, max_wait_sec):
    """长轮询检查审批状态"""
    poll_interval = 2
    max_attempts = max_wait_sec // poll_interval

    for attempt in range(max_attempts):
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{AEGIS_PORT}/api/monitoring/approval-status/{approval_id}",
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    result = json.loads(resp.read().decode("utf-8"))
                    status = result.get("status")
                    if status == "approved":
                        return {"status": "approved"}
                    if status in ("denied", "rejected"):
                        return {"status": "denied", "reason": result.get("reason", "审批被拒绝")}
        except Exception:
            pass
        time.sleep(poll_interval)

    # 超时标记
    _mark_approval_timeout(approval_id)
    return None

def _mark_approval_timeout(approval_id):
    """通知后端审批已超时"""
    try:
        data = json.dumps({}).encode("utf-8")
        req = urllib.request.Request(
            f"http://127.0.0.1:{AEGIS_PORT}/api/monitoring/approval-timeout/{approval_id}",
            data=data,
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(len(data)),
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            pass
    except Exception:
        pass

# ============================================================================
# 测试入口（直接运行脚本时测试）
# ============================================================================

if __name__ == "__main__":
    # 测试：模拟 Hermes 调用
    print("[Aegis] Hermes Plugin Hook 测试模式")
    print("[Aegis] 测试 allow（ls）...")
    result = pre_tool_call("terminal", {"command": "ls"}, "test_session")
    print(f"[Aegis] 结果: {result}")

    print("[Aegis] 测试 block（rm -rf /）...")
    result = pre_tool_call("terminal", {"command": "rm -rf /"}, "test_session")
    print(f"[Aegis] 结果: {result}")
