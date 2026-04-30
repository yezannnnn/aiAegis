"""
Aegis Plugin for Hermes Agent
==============================
Intercepts exec/terminal tool calls via pre_tool_call hook,
sends commands to Aegis daemon for approval, blocks if denied.

Install:
  mkdir -p ~/.hermes/plugins/aegis
  cp hermes_plugin.py ~/.hermes/plugins/aegis/__init__.py
  cp plugin.yaml ~/.hermes/plugins/aegis/plugin.yaml

Hermes discovers plugins from:
  ~/.hermes/plugins/<name>/plugin.yaml + __init__.py
"""

import json
import logging
import os
import socket
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# --- Configuration ---
AEGIS_HOST = os.environ.get("AEGIS_DAEMON_HOST", os.environ.get("AEGIS_HOST", "127.0.0.1"))
AEGIS_PORT = int(os.environ.get("AEGIS_DAEMON_PORT", os.environ.get("AEGIS_PORT", "9876")))
AEGIS_TIMEOUT_S = float(os.environ.get("AEGIS_TIMEOUT", "300"))  # 5 min
AEGIS_ENABLED = os.environ.get("HERMES_AEGIS_ENABLED", os.environ.get("AEGIS_ENABLED", "1")) != "0"

# Tools that execute shell commands (we intercept these)
EXEC_TOOLS = {"exec", "terminal", "shell", "spawn"}


def register(ctx):
    """Register pre_tool_call hook with Hermes plugin system."""
    ctx.register_hook("pre_tool_call", pre_tool_call)


def _send_to_daemon(payload: dict) -> Optional[dict]:
    """Send a JSONL request to the Aegis daemon and return the response."""
    try:
        request_line = json.dumps(payload, ensure_ascii=False)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(AEGIS_TIMEOUT_S)
        sock.connect((AEGIS_HOST, AEGIS_PORT))
        sock.sendall((request_line + "\n").encode("utf-8"))

        # Read response line
        response_data = b""
        while b"\n" not in response_data:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response_data += chunk

        sock.close()

        if response_data:
            line = response_data.decode("utf-8").strip()
            if line:
                return json.loads(line)

    except socket.timeout:
        logger.error("Aegis: daemon timeout (%.0fs)", AEGIS_TIMEOUT_S)
    except ConnectionRefusedError:
        logger.warning("Aegis: connection refused to %s:%d — passing through", AEGIS_HOST, AEGIS_PORT)
    except Exception as e:
        logger.error("Aegis: socket error: %s", e)

    return None


def _extract_command(args: Dict[str, Any]) -> Optional[str]:
    """Extract the command string from tool arguments."""
    # Hermes exec tool passes command as 'command' or first positional arg
    cmd = args.get("command") or args.get("cmd") or args.get("script")
    if cmd:
        return str(cmd)

    # Try argv-style
    argv = args.get("argv") or args.get("args")
    if argv and isinstance(argv, list) and len(argv) > 0:
        return " ".join(str(a) for a in argv)

    return None


def pre_tool_call(
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    task_id: str = "",
    session_id: str = "",
    tool_call_id: str = "",
    **kwargs,
) -> Optional[Dict[str, str]]:
    """
    pre_tool_call hook — intercepts exec/terminal tools and checks with Aegis.

    Returns:
        None                      → allow the tool to proceed
        {"action": "block", ...}  → block the tool with a message
    """
    if not AEGIS_ENABLED:
        return None

    if tool_name not in EXEC_TOOLS:
        return None

    if not args:
        return None

    command = _extract_command(args)
    if not command:
        return None

    # Build approval request
    payload = {
        "type": "approval_request",
        "payload": {
            "command": command,
            "cwd": os.getcwd(),
            "agentType": "hermes",
            "sessionKey": session_id or os.environ.get("HERMES_SESSION_KEY", "default"),
            "timestamp": int(time.time() * 1000),
        },
    }

    # Send to Aegis daemon
    response = _send_to_daemon(payload)

    if response is None:
        # Daemon not available → allow (fail open)
        return None

    if response.get("type") == "denied":
        reason = response.get("payload", {}).get("reason", "Blocked by Aegis")
        return {
            "action": "block",
            "message": (
                f"🛡 Aegis blocked: {reason}\n"
                f"Safe alternatives or manual approval required.\n"
                f"Check Aegis Monitor ({AEGIS_HOST}:{AEGIS_PORT}) for details."
            ),
        }

    if response.get("type") == "approval_resolution":
        decision = response.get("payload", {}).get("decision", "DENY")
        if decision in ("ALLOW", "ALLOW_SESSION", "ALLOW_ALWAYS"):
            return None  # allow
        else:
            return {
                "action": "block",
                "message": (
                    f"🛡 Aegis blocked: {decision} by user in Monitor.\n"
                    f"Ask user to approve via Aegis Monitor ({AEGIS_HOST}:{AEGIS_PORT}) "
                    f"or try a safer command.\n"
                ),
            }

    return None
