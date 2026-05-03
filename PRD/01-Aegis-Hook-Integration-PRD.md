# Aegis v2 多平台 Hook 集成技术方案 PRD

> PRD 编号: 01-Aegis-Hook-Integration  
> 版本: 1.0  
> 日期: 2026-05-03  
> 作者: Jarvis  
> 状态: 待审批

---

## 1. 项目背景与目标

### 1.1 现状
Aegis v2 当前支持 Claude Code 的 stdin/stdout hook 集成（`universal-hook.js`），采用**非阻塞**模式：
- Hook 脚本将命令 POST 到 Aegis 后端
- Aegis 立即返回，脚本将命令替换为 `echo "🛡️ 被阻止"`
- 用户需手动重试，无法做到"审批后自动放行"

### 1.2 目标
1. **新增 Hermes Agent 的 Plugin hooks 集成** —— 阻塞等待审批（HTTP 长轮询 60 秒）
2. **新增 Claude Code 的 `defer` 模式支持** —— 利用官方 `permissionDecision: "defer"` 实现阻塞等待
3. **统一前端 Dashboard 审批 UI** —— 同时服务两个平台的审批请求
4. **保持向后兼容** —— 现有 Claude Code 非阻塞模式继续可用

---

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| **Hook 来源** | 触发拦截的 AI 平台：Claude Code / Hermes Agent / OpenClaw |
| **阻塞等待** | Hook 暂停执行，等待外部审批决策后再继续 |
| **非阻塞** | Hook 立即返回，不等待审批 |
| **defer 模式** | Claude Code 官方机制：进程退出，session 挂起，resume 恢复 |
| **长轮询** | HTTP 请求挂起等待，超时后返回 block |
| **审批请求** | 需要用户审批的拦截事件 |
| **审批决策** | 用户对审批请求的响应：allow / deny |

---

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI Agent 平台层                                  │
├─────────────────────────┬─────────────────────────┬─────────────────────────┤
│      Claude Code         │      Hermes Agent       │      OpenClaw (未来)    │
│   (stdin/stdout hook)   │   (Python plugin hook)  │                         │
└──────────┬──────────────┴──────────┬──────────────┴─────────────────────────┘
           │                         │
           │ POST /api/v1/hooks/     │ POST /api/v1/hooks/
           │    pre-tool-call        │    pre-tool-call
           │ (非阻塞 / defer 模式)    │ (阻塞 60 秒)
           │                         │
           ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Aegis v2 后端 (NestJS)                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    HookController (新增)                               │   │
│  │  POST /api/v1/hooks/pre-tool-call                                     │   │
│  │  - 接收来自 Claude Code / Hermes 的拦截请求                            │   │
│  │  - 规则引擎预判断 (allow/deny/review)                                │   │
│  │  - 创建审批请求 (ApprovalRequest)                                    │   │
│  │  - 根据来源决定阻塞策略                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ApprovalService (扩展)                            │   │
│  │  - createRequest(): 创建审批请求                                     │   │
│  │  - waitForDecision(): 阻塞等待决策 (Hermes)                          │   │
│  │  - resolveWithDecision(): EventEmitter 唤醒挂起请求                   │   │
│  │  - deferSession(): 处理 Claude defer 模式                           │   │
│  │  - makeDecision(): 现有非阻塞决策 (兼容)                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    WebSocketGateway (现有)                             │   │
│  │  - broadcastApprovalRequest(): 推送审批请求到前端                      │   │
│  │  - handleApprovalResponse(): 接收前端审批响应                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    MonitoringController (现有)                        │   │
│  │  - POST /api/monitoring/approval-request (Claude 非阻塞模式)           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
           │
           │ WebSocket + HTTP
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Vue3 Dashboard 前端                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ApprovalPanel (新增/扩展)                           │   │
│  │  - 显示 pending 审批列表                                             │   │
│  │  - 区分来源 (Claude/Hermes)                                           │   │
│  │  - 显示阻塞状态 (等待中/已超时)                                       │   │
│  │  - 批准/拒绝按钮                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EventList (现有)                                  │   │
│  │  - 显示所有安全事件 (含审批状态)                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

#### 3.2.1 Hermes 阻塞等待流程

```
1. Hermes pre_tool_call 触发
   │
2. Python plugin POST Aegis /api/v1/hooks/pre-tool-call
   │  Payload: {tool_name, tool_input, session_id, source: "hermes", ...}
   │
3. Aegis 规则引擎判断 → action: "review"
   │
4. Aegis 创建 ApprovalRequest (status: pending)
   │
5. Aegis WebSocket 推送 approval_request 到前端 Dashboard
   │
6. Aegis HTTP 响应挂起 (waitForDecision, 60 秒超时)
   │
7. 前端用户点击"批准"
   │
8. 前端 POST /api/v1/approvals/:id/decision {action: "allow"}
   │
9. Aegis ApprovalService.resolveWithDecision() → EventEmitter 唤醒
   │
10. 挂起的 HTTP 响应返回 {action: "allow"}
   │
11. Hermes plugin 返回 {"action": "allow"} → 工具执行
```

#### 3.2.2 Claude Code defer 模式流程

```
1. Claude Code PreToolUse 触发 (claude -p 非交互模式)
   │
2. Hook 脚本 POST Aegis /api/v1/hooks/pre-tool-call
   │  Payload: {tool_name, tool_input, session_id, source: "claude", ...}
   │
3. Aegis 规则引擎判断 → action: "review"
   │
4. Aegis 创建 ApprovalRequest (status: pending, mode: "defer")
   │
5. Aegis 返回 {action: "defer", session_id, deferred_tool_use: {...}}
   │
6. Hook 脚本返回 {permissionDecision: "defer"}
   │
7. Claude Code 进程退出，stop_reason: "tool_deferred"
   │
8. Aegis WebSocket 推送 approval_request 到前端 Dashboard
   │
9. 前端用户点击"批准"
   │
10. 前端 POST /api/v1/approvals/:id/decision {action: "allow"}
   │
11. Aegis 记录决策，标记 session 为 "approved"
   │
12. Aegis 调用 claude -p --resume <session-id> 恢复会话
   │
13. 同一工具再次触发 PreToolUse
   │
14. Hook 脚本查询 Aegis，发现已批准
   │
15. Hook 返回 {permissionDecision: "allow"} → 工具执行
```

#### 3.2.3 Claude Code 非阻塞模式（现有，兼容）

```
1. Claude Code PreToolUse 触发
   │
2. Hook 脚本 POST Aegis /api/monitoring/approval-request (现有端点)
   │
3. Aegis 立即返回 {success: true, message: "等待审批"}
   │
4. Hook 脚本将命令替换为 echo "🛡️ 被阻止，请去 Dashboard 审批"
   │
5. Claude Code 执行 echo，用户看到提示
   │
6. Aegis WebSocket 推送 approval_request 到前端
   │
7. 前端用户点击"批准"
   │
8. 仅更新事件状态，已执行的命令不会重新执行
```

---

## 4. API 设计

### 4.1 新增端点

#### POST /api/v1/hooks/pre-tool-call
**用途**: 接收所有平台的 pre-tool 拦截请求

**Request Body**:
```json
{
  "source": "hermes" | "claude-code" | "openclaw",
  "tool_name": "terminal",
  "tool_input": {
    "command": "rm -rf /"
  },
  "session_id": "sess_abc123",
  "agent_type": "hermes-cli",
  "timestamp": "2026-05-03T12:00:00Z",
  "context": {
    "cwd": "/home/user/project",
    "rule_engine": {
      "action": "review",
      "reason": "破坏性命令需要审批",
      "category": "filesystem",
      "pattern": "rm -rf"
    }
  }
}
```

**Response (Hermes 阻塞模式 - 立即返回)**:
```json
{
  "action": "block",
  "message": "⏳ 命令已提交审批，请前往 Dashboard 批准",
  "request_id": "req_abc123",
  "status": "pending",
  "timeout_seconds": 60
}
```

**Response (Hermes 阻塞模式 - 审批后唤醒)**:
```json
{
  "action": "allow",
  "request_id": "req_abc123",
  "decision": "approved",
  "decided_by": "user",
  "decided_at": "2026-05-03T12:00:30Z"
}
```

**Response (Claude defer 模式)**:
```json
{
  "action": "defer",
  "message": "⏳ 命令已挂起，审批后可通过 resume 恢复",
  "request_id": "req_abc123",
  "session_id": "sess_abc123",
  "deferred_tool_use": {
    "id": "toolu_01abc",
    "name": "Bash",
    "input": {
      "command": "rm -rf /"
    }
  }
}
```

**Response (直接允许)**:
```json
{
  "action": "allow",
  "reason": "规则引擎允许"
}
```

**Response (直接阻止)**:
```json
{
  "action": "block",
  "message": "🛡️ 命令被规则引擎阻止: rm -rf 禁止执行"
}
```

---

#### POST /api/v1/approvals/:id/decision
**用途**: 前端提交审批决策

**Request Body**:
```json
{
  "action": "allow" | "deny",
  "reason": "用户备注",
  "user_id": "user_123"
}
```

**Response**:
```json
{
  "success": true,
  "request_id": "req_abc123",
  "decision": "allow",
  "affected_sessions": ["sess_abc123"],
  "timestamp": "2026-05-03T12:00:30Z"
}
```

---

#### GET /api/v1/approvals/pending
**用途**: 获取所有 pending 审批请求

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "req_abc123",
      "source": "hermes",
      "tool_name": "terminal",
      "tool_input": {"command": "rm -rf /"},
      "session_id": "sess_abc123",
      "status": "pending",
      "created_at": "2026-05-03T12:00:00Z",
      "elapsed_seconds": 15,
      "timeout_seconds": 60,
      "rule_reason": "破坏性命令需要审批"
    }
  ]
}
```

---

#### POST /api/v1/approvals/:id/resume (Claude defer 专用)
**用途**: 恢复 defer 模式的 Claude Code 会话

**Request Body**:
```json
{
  "session_id": "sess_abc123",
  "decision": "allow",
  "updated_input": {
    "command": "rm -rf /tmp/build"
  }
}
```

**Response**:
```json
{
  "success": true,
  "session_id": "sess_abc123",
  "resumed": true,
  "process_pid": 12345
}
```

---

### 4.2 WebSocket 事件

| 事件名 | 方向 |  payload | 说明 |
|--------|------|---------|------|
| `approval_request` | Server → Client | `{id, source, tool_name, tool_input, session_id, status, created_at, rule_reason}` | 新审批请求 |
| `approval_resolved` | Server → Client | `{id, decision, decided_by, decided_at}` | 审批已决策 |
| `approval_timeout` | Server → Client | `{id, session_id, elapsed_seconds}` | 审批超时 |
| `approval_response` | Client → Server | `{id, decision, reason}` | 前端提交决策 |

---

## 5. 后端设计

### 5.1 新增模块

```
backend/src/modules/hooks/
├── hooks.module.ts
├── hooks.controller.ts
├── hooks.service.ts
├── dto/
│   ├── pre-tool-call.dto.ts
│   ├── hook-response.dto.ts
│   └── index.ts
└── interfaces/
    ├── hook-source.enum.ts
    └── hook-action.enum.ts

backend/src/modules/approval/ (扩展)
├── approval.service.ts (新增方法)
├── approval.controller.ts (新增端点)
└── dto/
    ├── create-approval-request.dto.ts
    ├── approval-decision.dto.ts
    └── index.ts
```

### 5.2 ApprovalService 扩展

```typescript
// 新增接口
interface PendingApproval {
  id: string;
  source: 'hermes' | 'claude-code' | 'openclaw';
  tool_name: string;
  tool_input: any;
  session_id: string;
  status: 'pending' | 'approved' | 'denied' | 'timeout';
  mode: 'blocking' | 'defer' | 'non-blocking';
  rule_reason: string;
  created_at: Date;
  decided_at?: Date;
  decided_by?: string;
  // 阻塞等待用
  resolve?: (decision: HookDecision) => void;
  reject?: (reason: string) => void;
}

// 新增方法
class ApprovalService {
  // 创建审批请求
  createRequest(dto: CreateApprovalRequestDto): PendingApproval;
  
  // 阻塞等待决策 (Hermes)
  waitForDecision(requestId: string, timeoutMs: number): Promise<HookDecision>;
  
  // EventEmitter 唤醒挂起请求
  resolveWithDecision(requestId: string, decision: ApprovalDecisionDto): void;
  
  // 处理 Claude defer 模式
  deferSession(requestId: string, sessionId: string): DeferredSession;
  
  // 恢复 defer 会话
  resumeSession(sessionId: string, decision: ApprovalDecisionDto): Promise<boolean>;
  
  // 获取 pending 列表
  getPendingApprovals(): PendingApproval[];
  
  // 获取特定请求
  getApproval(requestId: string): PendingApproval | undefined;
  
  // 现有方法保持兼容
  makeDecision(sessionId: string, decision: {action: 'allow'|'deny', reason?: string}): any;
}
```

### 5.3 HooksService

```typescript
class HooksService {
  constructor(
    private readonly ruleEngine: RuleEngineService,
    private readonly approvalService: ApprovalService,
    private readonly webSocketGateway: WebSocketGateway,
    private readonly monitoringService: MonitoringService,
  ) {}

  async handlePreToolCall(dto: PreToolCallDto): Promise<HookResponseDto> {
    // 1. 规则引擎预判断
    const ruleResult = this.ruleEngine.checkCommand(dto.tool_input);
    
    if (ruleResult.action === 'allow') {
      return { action: 'allow', reason: ruleResult.reason };
    }
    
    if (ruleResult.action === 'deny') {
      return { action: 'block', message: `🛡️ ${ruleResult.reason}` };
    }
    
    // 2. 需要审批，创建请求
    const request = this.approvalService.createRequest({
      source: dto.source,
      tool_name: dto.tool_name,
      tool_input: dto.tool_input,
      session_id: dto.session_id,
      mode: this.determineMode(dto.source), // blocking | defer | non-blocking
      rule_reason: ruleResult.reason,
    });
    
    // 3. WebSocket 推送审批请求
    this.webSocketGateway.broadcastApprovalRequest({
      id: request.id,
      source: request.source,
      tool_name: request.tool_name,
      tool_input: request.tool_input,
      session_id: request.session_id,
      rule_reason: request.rule_reason,
    });
    
    // 4. 根据来源处理
    switch (request.mode) {
      case 'blocking': // Hermes
        return this.approvalService.waitForDecision(request.id, 60000);
        
      case 'defer': // Claude Code
        return {
          action: 'defer',
          request_id: request.id,
          session_id: request.session_id,
          deferred_tool_use: {
            id: dto.tool_use_id || 'unknown',
            name: dto.tool_name,
            input: dto.tool_input,
          },
        };
        
      case 'non-blocking': // Claude Code 兼容模式
      default:
        return {
          action: 'block',
          message: '⏳ 命令已提交审批，请前往 Dashboard 批准',
          request_id: request.id,
        };
    }
  }
  
  private determineMode(source: string): 'blocking' | 'defer' | 'non-blocking' {
    // 根据配置决定模式
    const config = {
      'hermes': 'blocking',
      'claude-code': 'defer', // 或 'non-blocking' 兼容模式
      'openclaw': 'blocking',
    };
    return config[source] || 'non-blocking';
  }
}
```

---

## 6. 前端设计

### 6.1 新增组件

```
frontend/src/components/approval/
├── ApprovalPanel.vue          # 审批面板主组件
├── ApprovalCard.vue           # 单个审批请求卡片
├── ApprovalList.vue           # 审批列表
├── ApprovalDetail.vue         # 审批详情
└── index.ts

frontend/src/stores/
├── approval.ts                # Pinia store (新增)
```

### 6.2 ApprovalPanel 设计

```vue
<template>
  <div class="approval-panel">
    <h2>待审批请求 ({{ pendingCount }})</h2>
    
    <div v-for="req in pendingApprovals" :key="req.id" class="approval-card">
      <div class="card-header">
        <span class="source-badge" :class="req.source">{{ req.source }}</span>
        <span class="tool-name">{{ req.tool_name }}</span>
        <span class="status" :class="req.status">{{ req.status }}</span>
      </div>
      
      <div class="card-body">
        <pre class="tool-input">{{ JSON.stringify(req.tool_input, null, 2) }}</pre>
        <p class="rule-reason">{{ req.rule_reason }}</p>
        <p class="elapsed">已等待 {{ req.elapsed_seconds }} 秒</p>
      </div>
      
      <div class="card-actions">
        <button 
          @click="approve(req.id)" 
          :disabled="req.status !== 'pending'"
          class="btn-approve"
        >
          ✅ 批准
        </button>
        <button 
          @click="deny(req.id)" 
          :disabled="req.status !== 'pending'"
          class="btn-deny"
        >
          ❌ 拒绝
        </button>
      </div>
    </div>
  </div>
</template>
```

### 6.3 Pinia Store

```typescript
export const useApprovalStore = defineStore('approval', {
  state: () => ({
    pendingApprovals: [] as ApprovalRequest[],
    resolvedApprovals: [] as ApprovalRequest[],
    isLoading: false,
  }),
  
  getters: {
    pendingCount: (state) => state.pendingApprovals.filter(a => a.status === 'pending').length,
    hermesPending: (state) => state.pendingApprovals.filter(a => a.source === 'hermes'),
    claudePending: (state) => state.pendingApprovals.filter(a => a.source === 'claude-code'),
  },
  
  actions: {
    // WebSocket 事件处理
    onApprovalRequest(data: ApprovalRequest) {
      this.pendingApprovals.push(data);
    },
    
    onApprovalResolved(data: { id: string; decision: string }) {
      const req = this.pendingApprovals.find(a => a.id === data.id);
      if (req) {
        req.status = data.decision === 'allow' ? 'approved' : 'denied';
        this.resolvedApprovals.push(req);
        this.pendingApprovals = this.pendingApprovals.filter(a => a.id !== data.id);
      }
    },
    
    async approve(requestId: string) {
      await api.post(`/api/v1/approvals/${requestId}/decision`, {
        action: 'allow',
      });
    },
    
    async deny(requestId: string) {
      await api.post(`/api/v1/approvals/${requestId}/decision`, {
        action: 'deny',
      });
    },
    
    async fetchPending() {
      const resp = await api.get('/api/v1/approvals/pending');
      this.pendingApprovals = resp.data.data;
    },
  },
});
```

---

## 7. Hermes Plugin 设计

### 7.1 Python Plugin 代码

```python
# ~/.hermes/plugins/aegis/plugin.py
import os
import json
import httpx
import asyncio

AEGIS_API_URL = os.getenv("AEGIS_API_URL", "http://127.0.0.1:3001/api/v1")
TIMEOUT_SECONDS = 60

def register(ctx):
    ctx.register_hook("pre_tool_call", aegis_pre_tool_call)
    ctx.register_hook("post_tool_call", aegis_post_tool_call)

async def aegis_pre_tool_call(tool_name: str, args: dict, task_id: str, **kwargs):
    """Aegis 安全拦截 Hook"""
    
    payload = {
        "source": "hermes",
        "tool_name": tool_name,
        "tool_input": args,
        "session_id": task_id or "unknown",
        "agent_type": "hermes-cli",
        "timestamp": datetime.now().isoformat(),
        "context": {
            "cwd": os.getcwd(),
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{AEGIS_API_URL}/hooks/pre-tool-call",
                json=payload,
                timeout=TIMEOUT_SECONDS + 5,  # 比后端超时多 5 秒
            )
            
            result = resp.json()
            
            if result.get("action") == "allow":
                return None  # 允许执行
            
            elif result.get("action") == "block":
                return {
                    "action": "block",
                    "message": result.get("message", "🛡️ 命令被 Aegis 阻止")
                }
            
            else:
                # 未知响应，默认阻止
                return {
                    "action": "block",
                    "message": f"🛡️ Aegis 响应异常: {result}"
                }
                
    except httpx.TimeoutException:
        return {
            "action": "block",
            "message": "⏰ Aegis 审批超时（60秒），命令已阻止。请检查 Dashboard 或稍后重试。"
        }
    except Exception as e:
        # Aegis 不可用，默认允许（fail-open）
        print(f"[Aegis] Hook error: {e}")
        return None

async def aegis_post_tool_call(tool_name: str, args: dict, result: str, **kwargs):
    """审计日志 Hook"""
    # 可选：记录工具调用结果
    pass
```

### 7.2 Plugin 目录结构

```
~/.hermes/plugins/aegis/
├── plugin.py          # 主插件文件
├── plugin.yaml        # 插件配置
└── README.md
```

### 7.3 plugin.yaml

```yaml
name: aegis
version: 2.0.0
description: Aegis Security Monitor - 工具调用安全拦截
author: yezannnnn
hooks:
  - pre_tool_call
  - post_tool_call
config:
  aegis_api_url:
    type: string
    default: http://127.0.0.1:3001/api/v1
    description: Aegis 后端 API 地址
  timeout_seconds:
    type: number
    default: 60
    description: 审批等待超时时间
```

---

## 8. Claude Code Hook 升级

### 8.1 现有 non-blocking 模式（保持兼容）

```javascript
// universal-hook.js (现有，不变)
// POST /api/monitoring/approval-request
// 立即返回，替换命令为 echo
```

### 8.2 新增 defer 模式支持

```javascript
// ~/.aegis/hooks/claude-defer-hook.js
const http = require('http');
const { exec } = require('child_process');

const AEGIS_PORT = 3001;

async function handlePreToolUse(input) {
  const data = JSON.stringify({
    source: 'claude-code',
    tool_name: input.tool_name,
    tool_input: input.tool_input,
    session_id: input.session_id || `sess_${Date.now()}`,
    tool_use_id: input.tool_use_id,
    mode: 'defer', // 请求 defer 模式
  });

  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: AEGIS_PORT,
      path: '/api/v1/hooks/pre-tool-call',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000, // defer 模式不需要长等待
    };

    const req = http.request(options, (res) => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(response);
          
          if (result.action === 'defer') {
            // 返回 defer，Claude Code 进程将退出
            resolve({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'defer',
                permissionDecisionReason: result.message || '等待 Aegis 审批',
              }
            });
          } else if (result.action === 'allow') {
            resolve({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
                permissionDecisionReason: result.reason,
              }
            });
          } else {
            // block 或其他
            resolve({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: result.message || '被 Aegis 阻止',
              }
            });
          }
        } catch {
          resolve(null); // 允许
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

// 恢复会话时调用
async function handleResume(sessionId, toolInput) {
  // 查询 Aegis 是否已批准
  const approval = await queryApproval(sessionId);
  
  if (approval.status === 'approved') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: approval.updated_input || toolInput,
      }
    };
  } else {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '审批被拒绝或超时',
      }
    };
  }
}

module.exports = { handlePreToolUse, handleResume };
```

---

## 9. 配置设计

### 9.1 Aegis 后端配置

```yaml
# aegis-config.yaml (新增)
hooks:
  # 各平台默认模式
  default_modes:
    hermes: blocking        # 阻塞等待
    claude-code: defer      # defer 模式（或 non-blocking 兼容模式）
    openclaw: blocking
  
  # 阻塞等待超时
  blocking_timeout_ms: 60000
  
  # defer 模式配置
  defer:
    # 是否自动 resume（需要 Aegis 调用 claude 命令）
    auto_resume: false
    # Claude Code 可执行路径
    claude_executable: "claude"
    # Session 保留天数
    session_retention_days: 30
  
  # 规则引擎
  rule_engine:
    config_path: "./aegis-rules.yaml"
    # 是否先本地判断再请求审批
    pre_check: true
```

### 9.2 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AEGIS_HOOK_MODE_HERMES` | `blocking` | Hermes 模式 |
| `AEGIS_HOOK_MODE_CLAUDE` | `defer` | Claude Code 模式 |
| `AEGIS_BLOCKING_TIMEOUT_MS` | `60000` | 阻塞超时 |
| `AEGIS_AUTO_RESUME` | `false` | 是否自动 resume defer |
| `AEGIS_CLAUDE_EXECUTABLE` | `claude` | Claude Code 路径 |

---

## 10. 数据库设计

### 10.1 扩展 Approval 表

```sql
-- 如果需要持久化，扩展现有表
ALTER TABLE approvals ADD COLUMN (
  source VARCHAR(50) NOT NULL DEFAULT 'claude-code',
  mode VARCHAR(20) NOT NULL DEFAULT 'non-blocking',
  tool_name VARCHAR(100),
  tool_input JSON,
  request_id VARCHAR(100) UNIQUE,
  timeout_seconds INT DEFAULT 60,
  elapsed_seconds INT DEFAULT 0,
  deferred_tool_use JSON,
  resumed_at TIMESTAMP,
  resumed_by VARCHAR(50),
  INDEX idx_source (source),
  INDEX idx_status_mode (status, mode)
);
```

### 10.2 内存存储（当前实现）

继续使用内存 Map，但增加字段：

```typescript
interface ApprovalRequest {
  id: string;
  source: 'hermes' | 'claude-code';
  mode: 'blocking' | 'defer' | 'non-blocking';
  tool_name: string;
  tool_input: any;
  session_id: string;
  status: 'pending' | 'approved' | 'denied' | 'timeout';
  rule_reason: string;
  created_at: Date;
  decided_at?: Date;
  decided_by?: string;
  // 阻塞等待用
  resolve?: (decision: HookDecision) => void;
  reject?: (reason: string) => void;
  // defer 用
  deferred_tool_use?: any;
  resumed_at?: Date;
}
```

---

## 11. 错误处理与边界情况

### 11.1 超时处理

| 场景 | 行为 |
|------|------|
| Hermes 阻塞 60 秒超时 | 返回 `{"action": "block", "message": "审批超时"}` |
| Claude defer 无超时 | Session 保留 30 天，直到 resume 或清理 |
| 前端断网 | 前端轮询兜底，恢复后同步状态 |

### 11.2 Aegis 后端崩溃

| 场景 | 行为 |
|------|------|
| Hermes 请求时 Aegis 不可用 | Plugin 捕获异常，默认允许（fail-open） |
| Claude 请求时 Aegis 不可用 | 返回 exit 0，允许执行 |
| 审批过程中 Aegis 重启 | 内存数据丢失，pending 请求变为孤儿。需持久化解决 |

### 11.3 重复审批

- 同一 session 的重复请求：创建新的 ApprovalRequest，旧的不影响
- 已决策的请求再次决策：返回错误，已决策不可修改

### 11.4 defer 模式限制

- **仅支持单工具调用**：Claude 一次调用多个工具时 defer 被忽略
- **仅非交互模式**：`claude -p` 才支持，交互模式自动 fallback 到 non-blocking
- **MCP 工具不可用**：resume 时 MCP server 未连接，返回 `tool_deferred_unavailable`

---

## 12. 测试计划

### 12.1 单元测试

```
backend/src/modules/hooks/hooks.service.spec.ts
- handlePreToolCall() allow 路径
- handlePreToolCall() deny 路径
- handlePreToolCall() blocking 路径 (Hermes)
- handlePreToolCall() defer 路径 (Claude)
- handlePreToolCall() non-blocking 路径 (兼容)
- waitForDecision() 超时
- resolveWithDecision() 正常唤醒

backend/src/modules/approval/approval.service.spec.ts
- createRequest()
- deferSession()
- resumeSession()
```

### 12.2 集成测试

```
test/integration/hooks.integration.spec.ts
- Hermes 完整阻塞审批流程
- Claude defer 完整流程
- Claude non-blocking 兼容流程
- 前端 Dashboard 审批交互
- WebSocket 事件广播
```

### 12.3 E2E 测试

```
test/e2e/hermes-blocking.e2e.spec.ts
- 启动 Hermes + Aegis
- 触发 terminal 工具调用
- 验证阻塞等待
- 前端批准
- 验证工具执行

test/e2e/claude-defer.e2e.spec.ts
- 启动 Claude Code -p
- 触发 Bash 工具调用
- 验证 defer 退出
- 前端批准
- 验证 resume 恢复
```

---

## 13. 实施计划

### Phase 1: 基础 API (2 天)
- [ ] 创建 `hooks.module` + `hooks.controller` + `hooks.service`
- [ ] 扩展 `ApprovalService` (waitForDecision, resolveWithDecision)
- [ ] 实现 `POST /api/v1/hooks/pre-tool-call`
- [ ] 实现 `POST /api/v1/approvals/:id/decision`
- [ ] 实现 `GET /api/v1/approvals/pending`

### Phase 2: WebSocket 集成 (1 天)
- [ ] 扩展 WebSocketGateway 审批事件
- [ ] 前端 ApprovalPanel 组件
- [ ] Pinia approval store
- [ ] 前后端联调

### Phase 3: Hermes Plugin (1 天)
- [ ] 编写 Python plugin
- [ ] 测试阻塞等待
- [ ] 测试超时
- [ ] 文档

### Phase 4: Claude defer 模式 (2 天)
- [ ] 升级 universal-hook.js 支持 defer
- [ ] 实现 resume 逻辑
- [ ] 测试 defer + resume 完整流程
- [ ] 处理限制情况（多工具、MCP 不可用）

### Phase 5: 兼容与优化 (1 天)
- [ ] 确保现有 non-blocking 模式继续工作
- [ ] 配置系统（环境变量 + 配置文件）
- [ ] 错误处理完善
- [ ] 文档更新

**总计: 7 天**

---

## 14. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Hermes 阻塞 60 秒影响用户体验 | 高 | 前端实时显示等待状态；支持快速审批（一键批准） |
| Claude defer 模式限制多 | 中 | 自动 fallback 到 non-blocking；文档明确限制 |
| Aegis 重启丢失 pending 请求 | 高 | Phase 2 加入持久化（Redis/DB） |
| 前端用户不在线 | 中 | 支持审批队列，用户上线后处理；超时后 block |
| 两个平台规则不一致 | 低 | 统一规则引擎，同一份 aegis-rules.yaml |

---

## 15. 附录

### 15.1 参考文档
- Hermes Plugin Hooks: https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks
- Claude Code Hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Aegis v2 现有架构: ~/Desktop/yezannnnn/aegis-v2/PROJECT_INFO.md

### 15.2 决策记录
- **ADR-001**: Hermes 使用阻塞等待（HTTP 长轮询 60 秒）而非轮询重试
- **ADR-002**: Claude Code 同时支持 defer 模式和 non-blocking 兼容模式
- **ADR-003**: 统一 API 端点 `/api/v1/hooks/pre-tool-call` 服务所有平台
- **ADR-004**: 默认 fail-open（Aegis 不可用时允许执行），避免阻塞工作流

---

> PRD 完成。等待审批后开始开发。
