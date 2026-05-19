# Aegis 冒烟测试架构

**测试框架**: Playwright (via aiGroup/kyle/skills/playwright)  
**测试脚本**: `tests/smoke/aegis-smoke-test.js`  
**运行脚本**: `tests/smoke/run.sh`  
**总用例数**: 26个（P0×14 / P1×9 / P2×3）  

---

## 运行方式

```bash
# 全量冒烟（推荐合并前执行）
cd tests/smoke && ./run.sh

# P0 核心拦截（5分钟内快跑）
cd tests/smoke && ./run.sh P0

# 无头模式（CI 环境）
cd tests/smoke && ./run.sh P0 headless

# 直接调 playwright runner
cd aiGroup/kyle/skills/playwright
HEADLESS=true node run.js /path/to/aegis-v2/tests/smoke/aegis-smoke-test.js
```

---

## 用例分层

### P0 — 核心拦截 API（14个，必须100%通过才能合并）

| 编号 | 测试场景 | 期望结果 |
|------|---------|---------|
| P0-1 | 安全命令 `ls -la` | allow |
| P0-2 | 危险命令 `rm -rf /` | block |
| P0-3 | 高风险命令 `git push --force` | block or review |
| P0-4 | 触发 review + 审批批准 | requiresApproval=true，批准成功 |
| P0-5 | 触发 review + 审批拒绝 | requiresApproval=true，拒绝成功 |
| P0-6 | WebSocket / Socket.IO 实时推送 | 握手成功，前端 CONNECTED |
| P0-7 | **单条危险命令基线** `git reset --hard HEAD` | review / git/reset-hard |
| P0-8 | **&& 链 — 危险命令在后段** `cd /tmp && git reset --hard HEAD` | review（核心修复验证）|
| P0-9 | **多节 && 链** `checkout -b && checkout master && reset --hard` | review（最严格优先）|
| P0-10 | **全无害 && 链** `cd /tmp && echo hello && ls` | allow（不误伤）|
| P0-11 | **分号分隔** `echo start; git reset --hard HEAD` | review |
| P0-12 | **\|\| 链** `false \|\| git reset --hard HEAD` | review |
| P0-13 | **引号内 &&** `echo "a && b"` | allow（引号保护）|
| P0-14 | **&& 链 rm -rf** `cd /tmp && rm -rf /` | block（最严格优先）|

> P0-7 到 P0-14 为 **splitCompoundCommand 修复验证套件**，由 Kyle 在 2026-05-18 验证 && 链绕过修复后添加。

### P1 — 核心 UI 功能（9个）

| 编号 | 测试场景 |
|------|---------|
| P1-1 | 规则列表正常加载 |
| P1-2 | 新建规则完整流程（弹窗 + 填写）|
| P1-3 | 保存前必须测试的门控（🔒 按钮）|
| P1-4 | 规则禁用/启用切换 |
| P1-5 | 删除自定义规则 |
| P1-6 | 规则过滤 tabs（ALL/GIT/DOCKER等）|
| P1-7 | Settings 页面正常加载 |
| P1-8 | Provider 切换自动填充 baseUrl/model |
| P1-9 | 中英文切换 |

### P2 — 边缘场景（3个）

| 编号 | 测试场景 |
|------|---------|
| P2-1 | SPA 路由刷新不返回 404 |
| P2-2 | 无 LLM 时 suggest-variants 降级静态变体 |
| P2-3 | 有 LLM 时 suggest-variants 返回 AI 变体 |

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AEGIS_URL` | `http://localhost:3001` | 后端地址 |
| `HEADLESS` | `false` | 无头模式（CI 设为 true）|
| `SLOW_MO` | `0` | 调试慢速（毫秒）|
| `FILTER` | `null` | 仅运行指定优先级（P0/P1/P2）|

---

## 合并检查门控

| 场景 | 要求 |
|------|------|
| PR 合并到 master | P0 全部通过（100%）|
| 版本发布前 | P0 + P1 全部通过 |
| 修复 && 链类 Bug | P0-7 ~ P0-14 必须验证 |
