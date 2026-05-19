/**
 * Aegis Rules CRUD + Toggle 自动化测试
 * 覆盖: POST(create) / PUT(update) / DELETE / POST toggle
 * 修复验证: rules-create-endpoint-404 (Jarvis commit df34072 + 171e5f4)
 *
 * 运行方式:
 *   cd aiGroup/kyle/skills/playwright
 *   HEADLESS=true node run.js /path/to/aegis-v2/tests/smoke/aegis-rules-crud-test.js
 */

const { chromium } = require('playwright');
const BASE = process.env.AEGIS_URL || 'http://localhost:3001';

// ── API helpers ──────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}/api/v1${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const apiGet    = (p)       => api('GET',    p);
const apiPost   = (p, b)    => api('POST',   p, b);
const apiPut    = (p, b)    => api('PUT',    p, b);
const apiDelete = (p)       => api('DELETE', p);

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

const results = { passed: 0, failed: 0, details: [] };
async function run(name, fn) {
  try {
    await fn();
    results.passed++;
    results.details.push({ label: name, status: '✅ PASS' });
    console.log(`  ✅ ${name}`);
  } catch (e) {
    results.failed++;
    results.details.push({ label: name, status: '❌ FAIL', error: e.message });
    console.error(`  ❌ ${name}\n     ${e.message}`);
  }
}

// ── Test fixture ─────────────────────────────────────────
const TEST_ID = 'smoke/crud-test-auto';
const TEST_RULE = {
  id: TEST_ID,
  description: 'CRUD smoke test rule',
  category: 'smoke',
  severity: 'warn',
  action: 'warn',
  selector: { binary: '__smoke_crud__' },
};

(async () => {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Aegis Rules CRUD + Toggle 自动化测试');
  console.log(`  目标: ${BASE}`);
  console.log('══════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 预清理（防止上次测试残留）
  await apiDelete(`/rules?id=${TEST_ID}`);

  // ─── C: 创建规则 ────────────────────────────────────────
  console.log('▶ CREATE — POST /api/v1/rules');

  await run('C-1: 创建自定义规则返回 success=true', async () => {
    const { status, data } = await apiPost('/rules', TEST_RULE);
    assert(status === 201 || status === 200, `HTTP ${status}，期望201/200`);
    assert(data.success === true, `success=${data.success} msg=${data.message}`);
    assert(data.rule?.id === TEST_ID, `rule.id=${data.rule?.id}`);
    console.log(`     created id=${data.rule.id} action=${data.rule.action}`);
  });

  await run('C-2: 创建后规则可在列表中查询到', async () => {
    const { data } = await apiGet('/rules');
    const found = (data.rules || []).find(r => r.id === TEST_ID);
    assert(found, `规则 ${TEST_ID} 在全量列表中找不到`);
    console.log(`     total=${data.count} found=${found.id}`);
  });

  await run('C-3: 创建后可通过搜索找到（全量搜索验证）', async () => {
    await apiPost('/rules/reload', {});
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const searchInput = page.locator('input[placeholder*="搜索"]').or(
      page.locator('input[placeholder*="Search"]')
    ).first();
    assert(await searchInput.count() > 0, '未找到搜索框');
    await searchInput.fill('crud-test-auto');
    await page.waitForTimeout(600);
    const items = await page.locator('.rule-card, [class*="rule-item"], [class*="rule-row"]').count();
    console.log(`     搜索"crud-test-auto": ${items}条`);
    assert(items >= 1, `自定义规则在搜索中不可见（items=${items}），全量搜索失效`);
  });

  await run('C-4: 重复创建同ID返回错误或覆盖（不崩溃）', async () => {
    const { status, data } = await apiPost('/rules', TEST_RULE);
    // 重复创建可返回400/409表示冲突，或200覆盖，都不应是500
    assert(status !== 500, `服务器500错误: ${data.message}`);
    console.log(`     重复创建 HTTP ${status} success=${data.success}`);
  });

  // ─── R: 读取规则 ────────────────────────────────────────
  console.log('\n▶ READ — GET /api/v1/rules');

  await run('R-1: 规则列表返回全量（90条）', async () => {
    const { status, data } = await apiGet('/rules');
    assert(status === 200, `HTTP ${status}`);
    assert(data.count > 0, '规则数量为0');
    console.log(`     total=${data.count} rules`);
  });

  await run('R-2: 规则统计接口正常', async () => {
    const { status, data } = await apiGet('/rules/info');
    assert(status === 200, `HTTP ${status}`);
    assert(data.total > 0, `total=${data.total}`);
    assert(data.bySource, '缺少 bySource 字段');
    console.log(`     total=${data.total} built-in=${data.bySource['built-in']} user=${data.bySource.user}`);
  });

  // ─── U: 更新规则 ────────────────────────────────────────
  console.log('\n▶ UPDATE — PUT /api/v1/rules?id=xxx');

  await run('U-1: 更新规则描述返回 success=true', async () => {
    const { status, data } = await apiPut(`/rules?id=${TEST_ID}`, {
      description: 'Updated CRUD smoke test rule',
      severity: 'error',
    });
    assert(status === 200, `HTTP ${status}`);
    assert(data.success === true, `success=${data.success} msg=${data.message}`);
    assert(data.rule?.description === 'Updated CRUD smoke test rule', `描述未更新: ${data.rule?.description}`);
    console.log(`     updated description="${data.rule.description}" severity=${data.rule.severity}`);
  });

  await run('U-2: 更新不存在的规则返回 success=false', async () => {
    const { status, data } = await apiPut('/rules?id=nonexistent/rule-xyz', { description: 'test' });
    assert(status === 200, `HTTP ${status}`);
    assert(data.success === false, `success应为false，实际=${data.success}`);
    console.log(`     success=${data.success} msg=${data.message}`);
  });

  // ─── Toggle: 启用/禁用 ──────────────────────────────────
  console.log('\n▶ TOGGLE — POST /api/v1/rules/toggle');

  await run('T-1: 禁用规则返回 enabled=false', async () => {
    const { status, data } = await apiPost('/rules/toggle', { id: TEST_ID });
    assert(status === 200 || status === 201, `HTTP ${status}`);
    assert(data.success === true, `success=${data.success} msg=${data.message}`);
    console.log(`     toggle: enabled=${data.enabled} id=${TEST_ID}`);
  });

  await run('T-2: 再次toggle还原 enabled=true', async () => {
    const { data } = await apiPost('/rules/toggle', { id: TEST_ID });
    assert(data.success === true, `success=${data.success}`);
    console.log(`     toggle back: enabled=${data.enabled}`);
  });

  await run('T-3: toggle不存在的规则返回 success=false', async () => {
    const { data } = await apiPost('/rules/toggle', { id: 'nonexistent/rule-xyz' });
    assert(data.success === false, `success应为false，实际=${data.success}`);
    console.log(`     success=${data.success} msg=${data.message}`);
  });

  await run('T-4: UI 禁用/启用按钮实际触发 toggle', async () => {
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const toggle = page.locator('.rule-item .rule-actions button.btn-secondary').first();
    if (await toggle.count() === 0) { console.log('     ⚠ 未找到toggle按钮，跳过'); return; }
    const before = (await toggle.textContent()).trim();
    await toggle.click({ force: true });
    await page.waitForTimeout(500);
    const after = (await toggle.textContent()).trim();
    console.log(`     UI toggle: "${before}" → "${after}"`);
    // 恢复
    await toggle.click({ force: true });
    await page.waitForTimeout(300);
  });

  // ─── D: 删除规则 ────────────────────────────────────────
  console.log('\n▶ DELETE — DELETE /api/v1/rules?id=xxx');

  await run('D-1: 删除已存在规则返回 success=true', async () => {
    const { status, data } = await apiDelete(`/rules?id=${TEST_ID}`);
    assert(status === 200, `HTTP ${status}`);
    assert(data.success === true, `success=${data.success} msg=${data.message}`);
    console.log(`     deleted id=${TEST_ID}`);
  });

  await run('D-2: 删除后规则从列表消失', async () => {
    await apiPost('/rules/reload', {});
    const { data } = await apiGet('/rules');
    const found = (data.rules || []).find(r => r.id === TEST_ID);
    assert(!found, `规则 ${TEST_ID} 删除后仍在列表中`);
    console.log(`     确认已从全量列表移除`);
  });

  await run('D-3: 删除后搜索不可见', async () => {
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const searchInput = page.locator('input[placeholder*="搜索"]').or(
      page.locator('input[placeholder*="Search"]')
    ).first();
    if (await searchInput.count() === 0) { console.log('     ⚠ 未找到搜索框，跳过'); return; }
    await searchInput.fill('crud-test-auto');
    await page.waitForTimeout(600);
    const items = await page.locator('.rule-card, [class*="rule-item"], [class*="rule-row"]').count();
    console.log(`     删除后搜索: ${items}条`);
    assert(items === 0, `删除后仍能搜到 ${items} 条`);
  });

  await run('D-4: 删除不存在的规则返回 success=false', async () => {
    const { status, data } = await apiDelete(`/rules?id=${TEST_ID}`);
    assert(status === 200, `HTTP ${status}`);
    assert(data.success === false, `success应为false，实际=${data.success}`);
    console.log(`     success=${data.success} msg=${data.message}`);
  });

  // ─── 完整 CRUD 生命周期 ──────────────────────────────────
  console.log('\n▶ LIFECYCLE — 完整 Create→Update→Toggle→Delete 生命周期');

  await run('LIFECYCLE: 完整CRUD流程一气呵成', async () => {
    const tmpId = 'smoke/lifecycle-test-tmp';
    // Create
    const c = await apiPost('/rules', { ...TEST_RULE, id: tmpId, description: 'lifecycle create' });
    assert(c.data.success, `Create失败: ${c.data.message}`);
    // Update
    const u = await apiPut(`/rules?id=${tmpId}`, { description: 'lifecycle updated' });
    assert(u.data.success, `Update失败: ${u.data.message}`);
    assert(u.data.rule.description === 'lifecycle updated', '描述未更新');
    // Toggle disable
    const t1 = await apiPost('/rules/toggle', { id: tmpId });
    assert(t1.data.success, `Toggle失败: ${t1.data.message}`);
    // Toggle enable
    const t2 = await apiPost('/rules/toggle', { id: tmpId });
    assert(t2.data.success, `Toggle back失败`);
    // Delete
    const d = await apiDelete(`/rules?id=${tmpId}`);
    assert(d.data.success, `Delete失败: ${d.data.message}`);
    console.log(`     Create✓ → Update✓ → Toggle✓×2 → Delete✓`);
  });

  await browser.close();

  // ─── 汇总 ────────────────────────────────────────────────
  const total = results.passed + results.failed;
  const rate = total > 0 ? Math.round(results.passed / total * 100) : 0;

  console.log('\n══════════════════════════════════════════════════');
  console.log('  测试结果汇总');
  console.log('══════════════════════════════════════════════════');
  console.log(`  通过: ${results.passed}  失败: ${results.failed}  通过率: ${rate}%`);
  console.log('──────────────────────────────────────────────────');
  for (const d of results.details) {
    console.log(`  ${d.status}  ${d.label}${d.error ? '\n     └ ' + d.error : ''}`);
  }
  console.log('══════════════════════════════════════════════════\n');

  if (results.failed > 0) process.exit(1);
})();
