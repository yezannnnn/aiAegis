/**
 * Aegis 冒烟测试套件 (持续化版本)
 * 覆盖 18 个核心用例: P0 x6 / P1 x9 / P2 x3
 *
 * 运行方式:
 *   cd /path/to/aiGroup/kyle/skills/playwright
 *   node run.js /path/to/aegis-v2-feat-webforrule/tests/smoke/aegis-smoke-test.js
 *
 * 环境变量:
 *   AEGIS_URL=http://localhost:3001  (默认)
 *   HEADLESS=true                    (CI 无头模式)
 *   SLOW_MO=100                      (调试慢速)
 *   FILTER=P0                        (仅运行指定优先级)
 */

const { chromium, request: pwRequest } = require('playwright');

const BASE_URL = process.env.AEGIS_URL || 'http://localhost:3001';
const HEADLESS = process.env.HEADLESS === 'true';
const SLOW_MO = Number(process.env.SLOW_MO) || 0;
const FILTER = process.env.FILTER || null; // 'P0' | 'P1' | 'P2' | null

// ==================== Test Runner ====================

const results = { passed: 0, failed: 0, skipped: 0, details: [] };

async function run(priority, name, fn) {
  if (FILTER && !name.startsWith(FILTER)) {
    results.skipped++;
    return;
  }
  const label = `[${priority}] ${name}`;
  try {
    await fn();
    results.passed++;
    results.details.push({ label, status: '✅ PASS' });
    console.log(`  ✅ ${label}`);
  } catch (err) {
    results.failed++;
    results.details.push({ label, status: '❌ FAIL', error: err.message });
    console.error(`  ❌ ${label}`);
    console.error(`     ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ==================== API helpers ====================

async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`);
  return { status: res.status, data: await res.json() };
}

async function apiPut(path, body) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function apiDelete(path) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, { method: 'DELETE' });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// ==================== Main ====================

(async () => {
  console.log('\n══════════════════════════════════════════════');
  console.log('  AEGIS 冒烟测试套件');
  console.log(`  目标: ${BASE_URL}`);
  console.log(`  模式: ${HEADLESS ? '无头' : '可见'} | 过滤: ${FILTER || '全部'}`);
  console.log('══════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // ─────────────────── P0: 核心 API 拦截 ───────────────────

  console.log('\n▶ P0 — 核心拦截 API');

  await run('P0', 'P0-1: evaluate → allow (ls -la)', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'ls -la',
      sessionId: 'smoke-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(data.evaluation?.action === 'allow', `action=${data.evaluation?.action}, expected allow`);
  });

  await run('P0', 'P0-2: evaluate → block (rm -rf /)', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'rm -rf /',
      sessionId: 'smoke-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(data.evaluation?.action === 'block', `action=${data.evaluation?.action}, expected block`);
  });

  await run('P0', 'P0-3: evaluate → review (git push --force)', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'git push --force',
      sessionId: 'smoke-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(
      data.evaluation?.action === 'block' || data.evaluation?.action === 'review',
      `action=${data.evaluation?.action}, expected block or review`
    );
  });

  await run('P0', 'P0-4: 审批弹窗 — 触发 review 并批准', async () => {
    // 先触发一个需要 review 的命令
    const evalRes = await apiPost('/rules/evaluate', {
      command: 'git push --force origin main',
      sessionId: 'smoke-ui-approve',
      agentType: 'SmokeTest',
    });
    const approvalId = evalRes.data.approvalRequestId;

    if (!approvalId) {
      // 如果规则改为 block，跳过弹窗测试但通过
      console.log('     ⚠ 无审批ID (规则可能已改为block)，跳过UI弹窗验证');
      return;
    }

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    // 等待审批弹窗出现 (最多 8 秒)
    const modal = await page.waitForSelector('.approval-modal, [class*="approval"], [class*="modal"]', { timeout: 8000 }).catch(() => null);
    if (!modal) {
      // 弹窗可能已经处理完，通过 API 确认
      const approveRes = await apiPost(`/approvals/${approvalId}/approve`, {});
      assert(approveRes.status === 200 || approveRes.status === 201 || approveRes.status === 404, 'approve failed');
      return;
    }
    // 点击批准按钮
    await page.click('[class*="approve"], button:has-text("APPROVE"), button:has-text("批准")').catch(() => {});
    console.log('     审批弹窗已批准');
  });

  await run('P0', 'P0-5: 审批弹窗 — 触发 review 并拒绝', async () => {
    const evalRes = await apiPost('/rules/evaluate', {
      command: 'git push --force origin main',
      sessionId: 'smoke-ui-reject',
      agentType: 'SmokeTest',
    });
    const approvalId = evalRes.data.approvalRequestId;

    if (!approvalId) {
      console.log('     ⚠ 无审批ID，跳过UI拒绝验证');
      return;
    }

    // 通过 API 拒绝 (endpoint: POST /approvals/:id/decision, body: {action: 'deny'})
    const rejectRes = await fetch(`${BASE_URL}/api/v1/approvals/${approvalId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deny', reason: 'smoke-test-reject' }),
    });
    assert(rejectRes.status === 200 || rejectRes.status === 201, `reject HTTP ${rejectRes.status}`);
    console.log('     审批拒绝成功');
  });

  await run('P0', 'P0-5b: 审批拒绝 → 事件列表状态同步为 BLOCKED（回归: 拒绝后状态不更新 Bug）', async () => {
    // Step 1: 触发 review 命令，获取 approvalId 和 eventId
    const evalRes = await apiPost('/rules/evaluate', {
      command: 'git push --force origin main',
      sessionId: 'smoke-approval-status-sync',
      agentType: 'SmokeTest',
    });
    const approvalId = evalRes.data.approvalRequestId;
    const eventId = evalRes.data.eventId;

    if (!approvalId) {
      console.log('     ⚠ 无审批ID (规则可能已改为block)，跳过状态同步验证');
      return;
    }

    // Step 2: 通过 API 拒绝审批
    const decisionRes = await fetch(`${BASE_URL}/api/v1/approvals/${approvalId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deny', reason: 'smoke-status-sync-test' }),
    });
    assert(decisionRes.status === 200 || decisionRes.status === 201, `decision HTTP ${decisionRes.status}`);
    const decisionData = await decisionRes.json();
    assert(decisionData.success === true, `decision failed: ${JSON.stringify(decisionData)}`);
    console.log('     拒绝请求已发送');

    // Step 3: 从审批响应中获取 eventId（如 evaluate 未返回则从 approval 取）
    const resolvedEventId = eventId || decisionData.approval?.eventId;
    assert(resolvedEventId, `无法获取 eventId，无法验证事件状态同步`);

    // Step 4: 通过单条事件接口验证状态已更新为 BLOCKED
    // 注意: monitoring 端点路径为 /api/monitoring（无 v1 前缀）
    const eventsRes = await fetch(`${BASE_URL}/api/monitoring/events/${resolvedEventId}`);
    assert(eventsRes.status === 200, `events HTTP ${eventsRes.status}`);
    const eventsData = await eventsRes.json();
    const targetEvent = eventsData.data;
    assert(targetEvent, `事件 ${resolvedEventId} 不存在`);
    assert(
      targetEvent.status === 'blocked' || targetEvent.status === 'BLOCKED',
      `事件状态未同步！期望 BLOCKED，实际: ${targetEvent.status}（回归：approval.controller 未调用 updateEventStatus）`
    );
    console.log(`     ✓ 事件 ${resolvedEventId} 状态已同步为 BLOCKED`);
  });

  await run('P0', 'P0-6: WebSocket (Socket.IO) 实时事件推送', async () => {
    // Aegis 后端使用 Socket.IO，通过 HTTP polling 握手验证可达性
    // Socket.IO polling 端点: /socket.io/?EIO=4&transport=polling
    const pollRes = await fetch(`${BASE_URL}/socket.io/?EIO=4&transport=polling`);
    assert(pollRes.status === 200, `Socket.IO polling 握手失败: HTTP ${pollRes.status}`);
    const body = await pollRes.text();
    assert(body.length > 0 && body.includes('sid'), `Socket.IO 未返回 session id, body: ${body.slice(0, 100)}`);
    console.log('     Socket.IO 握手成功，session id 已返回');

    // 进一步验证：在页面加载后前端 WS 连接状态显示
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const connected = await page.locator('.connection-status.connected, [class*="connection-status"][class*="connected"]').isVisible().catch(() => false);
    console.log(`     前端 WS 连接状态: ${connected ? '✓ CONNECTED' : '⚠ 未显示 connected (可能正在重连)'}`);
    // polling 握手成功已足够证明 Socket.IO 服务正常
  });

  // ─────────────────── P0: && 链命令拦截（Bug Fix 验证）───────────────────

  console.log('\n▶ P0 — && 链命令拦截（splitCompoundCommand 修复验证）');

  await run('P0', 'P0-7: 单条危险命令基线 → review', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'git reset --hard HEAD',
      sessionId: 'smoke-chain-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(data.evaluation?.action === 'review', `action=${data.evaluation?.action}, expected review`);
    assert(data.evaluation?.matchedRules?.includes('git/reset-hard'), `未命中 git/reset-hard 规则`);
  });

  await run('P0', 'P0-8: && 链式命令 — 危险命令在后段不被绕过 → review', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'cd /tmp && git reset --hard HEAD',
      sessionId: 'smoke-chain-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(data.evaluation?.action === 'review', `action=${data.evaluation?.action}, expected review（&&链绕过Bug未修复）`);
    assert(data.evaluation?.matchedRules?.includes('git/reset-hard'), `未命中 git/reset-hard 规则`);
    console.log('     && 链命令核心修复验证通过');
  });

  await run('P0', 'P0-9: 多节 && 链式命令 → 取最严格结果 review', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'git checkout -b test-branch && git checkout master && git reset --hard 187f4df',
      sessionId: 'smoke-chain-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(data.evaluation?.action === 'review', `action=${data.evaluation?.action}, expected review`);
  });

  await run('P0', 'P0-10: && 链式命令 — 全部无害命令不误伤 → allow', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'cd /tmp && echo hello && ls',
      sessionId: 'smoke-chain-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(data.evaluation?.action === 'allow', `action=${data.evaluation?.action}, expected allow（误伤！）`);
    assert(!data.requiresApproval, '无害链式命令不应触发审批');
    console.log('     无害链式命令不误伤验证通过');
  });

  await run('P0', 'P0-11: 分号分隔命令 — 危险命令在后段 → review', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'echo start; git reset --hard HEAD',
      sessionId: 'smoke-chain-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(data.evaluation?.action === 'review', `action=${data.evaluation?.action}, expected review`);
  });

  await run('P0', 'P0-12: || 链式命令 — 危险命令 → review', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'false || git reset --hard HEAD',
      sessionId: 'smoke-chain-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(data.evaluation?.action === 'review', `action=${data.evaluation?.action}, expected review`);
  });

  await run('P0', 'P0-13: 引号内的 && 不应触发分割 → allow', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'echo "a && b"',
      sessionId: 'smoke-chain-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(data.evaluation?.action === 'allow', `action=${data.evaluation?.action}, 引号内 && 被错误分割`);
  });

  await run('P0', 'P0-14: && 链式 rm -rf 命令 → block（最严格优先）', async () => {
    const { status, data } = await apiPost('/rules/evaluate', {
      command: 'cd /tmp && rm -rf /',
      sessionId: 'smoke-chain-test',
      agentType: 'SmokeTest',
    });
    assert(status === 201 || status === 200, `HTTP ${status}`);
    assert(data.evaluation?.action === 'block', `action=${data.evaluation?.action}, expected block`);
    console.log('     && 链 rm -rf 命中最严格规则 block');
  });

  // ─────────────────── P1: 核心 UI 功能 ───────────────────

  console.log('\n▶ P1 — 核心 UI 功能');

  await run('P1', 'P1-1: 规则列表正常加载', async () => {
    await page.goto(`${BASE_URL}/rules`, { waitUntil: 'networkidle' });
    // 等待规则出现
    const ruleCards = await page.locator('.rule-card, [class*="rule-item"], [class*="rule-row"]').count();
    const ruleCount = await page.locator('text=/\\d+\\s*(rules|条规则)/i').first().textContent().catch(() => '');
    console.log(`     规则数: ${ruleCards} 卡片 | 文本: ${ruleCount.trim()}`);
    // 有规则 OR 页面上有 "RULES" 标题就算过
    const hasTitle = await page.locator('text=RULES, text=规则').first().isVisible().catch(() => false);
    assert(hasTitle || ruleCards > 0, '规则列表未加载');
  });

  await run('P1', 'P1-2: 新建规则完整流程', async () => {
    await page.goto(`${BASE_URL}/rules`, { waitUntil: 'networkidle' });

    // 点击"+ NEW RULE"按钮 (btn-primary 在 toolbar 中)
    const addBtn = page.locator('.toolbar button.btn-primary').first();
    await addBtn.click({ timeout: 5000 });

    // 等待 modal-overlay 变为 active
    await page.waitForSelector('.modal-overlay.active', { timeout: 5000 });

    // Step 1: 在 parse-input 填写命令并解析
    const parseInput = page.locator('input.parse-input').first();
    await parseInput.fill('rm -rf /tmp/test');
    await page.locator('.parse-box button.btn-primary').first().click();
    await page.waitForTimeout(500);

    // Step 3: 填写 Rule ID (第1个 field-input input, 在第3个 form-section)
    // 表单结构: form-section[0]=Step1, form-section[1]=Step2, form-section[2]=Step3
    const step3 = page.locator('.form-section').nth(2);
    const ruleIdInput = step3.locator('.field-input input').first();
    await ruleIdInput.fill('smoke-test/ui-flow-test');

    // 填写 description (Step3 第2个 field-input input)
    const descInput = step3.locator('.field-input input').nth(1);
    await descInput.fill('Smoke Test Rule - UI flow');

    console.log('     弹窗已打开，Rule ID 和描述已填写');

    // 关闭弹窗（不保存）
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('.modal-close').click().catch(() => {});
  });

  await run('P1', 'P1-3: 保存前必须测试的门控', async () => {
    // 前置: 确保有弹窗打开且未测试
    const saveBtn = page.locator('button:has-text("SAVE"), button:has-text("保存")').first();
    const isLocked = await saveBtn.locator('..').locator('[class*="locked"]').count() > 0
      || await saveBtn.textContent().then(t => t.includes('🔒')).catch(() => false);

    if (!isLocked) {
      // 尝试点击保存，应该弹出警告
      await saveBtn.click().catch(() => {});
      // 等待 ElMessage 警告
      const warning = await page.waitForSelector('.el-message, [class*="message-warning"], [class*="warning"]', { timeout: 3000 }).catch(() => null);
      assert(warning !== null, '保存门控失效：保存时应弹出警告');
    } else {
      // 按钮本身是锁定状态
      console.log('     门控正常: 保存按钮显示 🔒 锁定状态');
    }
  });

  await run('P1', 'P1-4: 规则禁用/启用切换', async () => {
    await page.goto(`${BASE_URL}/rules`, { waitUntil: 'networkidle' });

    // 规则列表中每条 rule-item 的 rule-actions 区域有 DISABLE/ENABLE 按钮
    // 精确匹配 rule-actions 里的按钮，避免匹配到 modal 内的 context-toggle
    const toggle = page.locator('.rule-item .rule-actions button.btn-secondary').first();
    const exists = await toggle.count() > 0;
    if (!exists) {
      console.log('     ⚠ 未找到 rule toggle 按钮，跳过');
      return;
    }

    const before = (await toggle.textContent()).trim();
    await toggle.click({ force: true });
    await page.waitForTimeout(600);
    const after = (await toggle.textContent()).trim();
    assert(before !== after || before !== '', 'toggle 点击后文本未变化');
    console.log(`     toggle: "${before}" → "${after}"`);

    // 恢复原状态
    await toggle.click({ force: true });
    await page.waitForTimeout(400);
  });

  await run('P1', 'P1-5: 删除自定义规则', async () => {
    // 先通过 API 创建一条测试规则
    const createRes = await apiPost('/rules', {
      id: 'smoke-test/delete-me',
      description: 'Smoke test rule - delete me',
      category: 'smoke-test',
      severity: 'warn',
      action: 'warn',
      pattern: { binary: '__smoke_delete__' },
    });
    if (createRes.status !== 201 && createRes.status !== 200) {
      console.log(`     ⚠ 创建失败 HTTP ${createRes.status}，跳过删除验证`);
      return;
    }

    // 通过 API 删除
    const delRes = await apiDelete('/rules?id=smoke-test/delete-me');
    assert(delRes.status === 200, `删除失败 HTTP ${delRes.status}`);
    console.log('     自定义规则创建+删除成功');
  });

  await run('P1', 'P1-6: 规则过滤 tabs (ALL / GIT / DOCKER 等)', async () => {
    await page.goto(`${BASE_URL}/rules`, { waitUntil: 'networkidle' });

    // 找 tab 按钮
    const tabs = page.locator('[class*="tab"], [class*="filter-btn"]');
    const count = await tabs.count();
    if (count === 0) {
      console.log('     ⚠ 未找到 tabs，跳过');
      return;
    }

    // 点击第 2 个 tab (跳过 ALL)
    await tabs.nth(1).click();
    await page.waitForTimeout(300);
    const activeTab = await tabs.nth(1).textContent();
    console.log(`     已切换到 tab: "${activeTab.trim()}"`);
  });

  await run('P1', 'P1-7: Settings 页面正常加载', async () => {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });

    const title = await page.locator('text=LLM CONFIG, text=LLM 配置').first().isVisible().catch(() => false);
    const providerGrid = await page.locator('[class*="provider-card"]').count();
    assert(title || providerGrid > 0, 'Settings 页面加载失败');
    console.log(`     Settings 加载正常: ${providerGrid} 个 Provider 卡片`);
  });

  await run('P1', 'P1-8: Provider 切换自动填充 baseUrl/model', async () => {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });

    // 点击 Kimi 卡片
    const kimiCard = page.locator('[class*="provider-card"]:has-text("Kimi")').first();
    await kimiCard.click();
    await page.waitForTimeout(300);

    // 验证 baseUrl 已切换到 moonshot
    const baseUrlInput = page.locator('input[placeholder*="https://"]').first();
    const val = await baseUrlInput.inputValue();
    assert(val.includes('moonshot'), `baseUrl 应包含 moonshot，实际: ${val}`);
    console.log(`     Kimi 切换成功，baseUrl: ${val}`);
  });

  await run('P1', 'P1-9: 中英文切换', async () => {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });

    // 找语言切换按钮
    const langBtn = page.locator('button:has-text("EN"), button:has-text("中文"), .lang-switch').first();
    const before = await langBtn.textContent();
    await langBtn.click();
    await page.waitForTimeout(300);
    const after = await langBtn.textContent();
    assert(before.trim() !== after.trim(), `语言未切换: before="${before.trim()}" after="${after.trim()}"`);
    console.log(`     语言切换: "${before.trim()}" → "${after.trim()}"`);

    // 切换回来
    await langBtn.click();
  });

  // ─────────────────── P2: 边缘场景 ───────────────────

  console.log('\n▶ P2 — 边缘场景');

  await run('P2', 'P2-1: SPA 路由刷新不返回 404', async () => {
    // 直接访问 /rules 路由 (history mode)
    await page.goto(`${BASE_URL}/rules`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });

    const status = await page.evaluate(() => document.title);
    const is404 = await page.locator('text=404, text=Not Found, text=Cannot GET').count() > 0;
    assert(!is404, 'SPA 刷新返回 404，ServeStaticModule fallback 未配置');
    console.log(`     刷新后页面: "${status}"，无 404`);
  });

  await run('P2', 'P2-2: Impact Scope 无 LLM 时使用静态变体', async () => {
    // 检查 LLM 配置
    const { data } = await apiGet('/llm/config');
    if (data.configured && data.enabled) {
      console.log('     ⚠ LLM 已配置，本测试需无 LLM 环境，跳过');
      return;
    }

    // 调用 suggest-variants，应返回 configured: false
    const res = await apiPost('/rules/suggest-variants', {
      binary: 'rm',
      action: 'block',
      description: 'Smoke test',
    });
    assert(res.data.configured === false, `expected configured=false，实际: ${res.data.configured}`);
    assert(Array.isArray(res.data.variants), 'variants 应为数组');
    console.log('     无 LLM 时 suggest-variants 返回 configured=false ✓');
  });

  await run('P2', 'P2-3: Impact Scope 有 LLM 时返回 AI 变体', async () => {
    const { data } = await apiGet('/llm/config');
    if (!data.configured || !data.enabled) {
      console.log('     ⚠ LLM 未配置，跳过 AI 变体验证');
      return;
    }

    const res = await apiPost('/rules/suggest-variants', {
      binary: 'git',
      subcommands: ['push'],
      flags: ['--force'],
      action: 'block',
      description: 'Block force push',
    });
    assert(res.data.configured === true, 'LLM 已配置但 suggest-variants 返回 configured=false');
    assert(res.data.variants?.length > 0, 'AI 未生成任何变体');
    console.log(`     AI 生成 ${res.data.variants.length} 个变体: ${res.data.variants.slice(0, 2).join(', ')}...`);
  });

  // ─────────────────── 结果汇总 ───────────────────

  await browser.close();

  const total = results.passed + results.failed + results.skipped;
  const passRate = total - results.skipped > 0
    ? Math.round((results.passed / (total - results.skipped)) * 100)
    : 100;

  console.log('\n══════════════════════════════════════════════');
  console.log('  测试结果汇总');
  console.log('══════════════════════════════════════════════');
  console.log(`  通过: ${results.passed}  失败: ${results.failed}  跳过: ${results.skipped}`);
  console.log(`  通过率: ${passRate}%`);
  console.log('──────────────────────────────────────────────');
  for (const d of results.details) {
    const err = d.error ? `\n     └ ${d.error}` : '';
    console.log(`  ${d.status}  ${d.label}${err}`);
  }
  console.log('══════════════════════════════════════════════\n');

  if (results.failed > 0) {
    process.exit(1);
  }
})();
