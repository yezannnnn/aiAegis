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
    # 只拦截 Shell 相关工具
    if tool_name not in ("terminal", "Shell"):
        return None

    command = args.get("command", "")
    if not command:
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
        reason = evaluation.get("reason", "规则拦截")
        return {
            "action": "block",
            "message": f"[Aegis] {reason}"
        }

    if action == "review":
        approval_id = result.get("approvalRequestId")
        if not approval_id:
            return {
                "action": "block",
                "message": "[Aegis] 无法创建审批请求"
            }

        # 长轮询等待审批（最多 60 秒）
        decision = _poll_for_approval(approval_id, 60)
        if decision and decision.get("status") == "approved":
            return None

        reason = decision.get("reason", "审批超时") if decision else "审批超时"
        return {
            "action": "block",
            "message": f"[Aegis] {reason} — 请在 http://localhost:{AEGIS_PORT} 审批后重试"
        }

    # 未知 action，默认放行
    return None

# ============================================================================
# HTTP 通信（标准库 urllib，无额外依赖）
# ============================================================================

def _evaluate_with_backend(payload):
    """POST /api/v1/rules/evaluate"""
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
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[Aegis] 后端评估失败: {e}", file=sys.stderr)
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
                    if status == "rejected":
                        return {"status": "rejected", "reason": result.get("reason", "审批被拒绝")}
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
