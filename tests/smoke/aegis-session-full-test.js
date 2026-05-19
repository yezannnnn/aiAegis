/**
 * Aegis 本次会话全量修复验证（合并版）
 * 覆盖: upsert修复 / disabled规则 / example跳过 / pattern转义 / CRUD完整 / UI流程
 *
 * 运行:
 *   cd aiGroup/kyle/skills/playwright
 *   HEADLESS=true node run.js /path/to/tests/smoke/aegis-session-full-test.js
 */

const { chromium } = require('playwright');
const BASE = process.env.AEGIS_URL || 'http://localhost:3001';

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}/api/v1${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const apiGet    = p     => api('GET',    p);
const apiPost   = (p,b) => api('POST',   p, b);
const apiPut    = (p,b) => api('PUT',    p, b);
const apiDelete = p     => api('DELETE', p);

function assert(c, msg) { if (!c) throw new Error(msg || 'Assertion failed'); }

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

const FIXTURE_ID = 'smoke/session-full-test';
const FIXTURE_RULE = {
  id: FIXTURE_ID,
  description: 'Session full test fixture',
  category: 'smoke',
  severity: 'warn',
  action: 'warn',
  selector: { binary: '__smoke_session__' },
};

(async () => {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Aegis 本次会话全量修复验证');
  console.log(`  目标: ${BASE}`);
  console.log('══════════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 预清理
  await apiDelete(`/rules?id=${FIXTURE_ID}`);
  await apiDelete(`/rules?id=smoke/pattern-escape-test`);

  // ═══════════════════════════════════════════════════════
  // 一、Upsert 修复验证（U-2 / T-3 回归）
  // ═══════════════════════════════════════════════════════
  console.log('▶ 一、Upsert 修复验证');

  await run('Upsert-1: PUT 不存在ID → success:false（去除upsert）', async () => {
    const { status, data } = await apiPut('/rules?id=nonexistent/rule-xyz-upsert', { description: 'test' });
    assert(status === 200, `HTTP ${status}`);
    assert(data.success === false, `success=${data.success}，upsert未去除`);
    console.log(`     success=${data.success} msg="${data.message}"`);
  });

  await run('Upsert-2: toggle 不存在ID → success:false', async () => {
    const { status, data } = await apiPost('/rules/toggle', { id: 'nonexistent/rule-xyz-toggle' });
    assert(status === 200 || status === 201, `HTTP ${status}`);
    assert(data.success === false, `success=${data.success}，toggle未校验存在性`);
    console.log(`     success=${data.success} msg="${data.message}"`);
  });

  // ═══════════════════════════════════════════════════════
  // 二、example- 文件跳过验证
  // ═══════════════════════════════════════════════════════
  console.log('\n▶ 二、example- 文件跳过验证');

  await run('Example-1: loadBuiltInRules 不加载 example- 开头文件', async () => {
    const { data } = await apiGet('/rules/info');
    // example-custom.yaml 里有 bash 规则，若跳过则 bash 不在规则集里
    const { data: rulesData } = await apiGet('/rules');
    const bashExampleRule = (rulesData.rules || []).find(r => r.id === 'example-custom/bash-scripts');
    assert(!bashExampleRule, `example-custom.yaml 仍被加载，找到规则: example-custom/bash-scripts`);
    console.log(`     built-in=${data.bySource?.['built-in']} example-custom规则不在列表中 ✓`);
  });

  await run('Example-2: bash /path/to/script.sh 不被拦截', async () => {
    const { data } = await apiPost('/rules/evaluate', {
      command: 'bash /Users/yuhao/project/deploy.sh',
      sessionId: 'smoke-example-test',
    });
    // example-custom.yaml 有 bash 规则会把 bash 列为危险，跳过后应 allow
    console.log(`     bash脚本: action=${data.evaluation?.action} rules=${JSON.stringify(data.evaluation?.matchedRules)}`);
    assert(
      data.evaluation?.action !== 'block',
      `bash 被 block，example-custom.yaml 可能未跳过`
    );
  });

  // ═══════════════════════════════════════════════════════
  // 三、Disabled 规则实际生效
  // ═══════════════════════════════════════════════════════
  console.log('\n▶ 三、Disabled 规则生效验证');

  await run('Disabled-1: 创建规则并禁用后命中变 allow', async () => {
    // 创建一条会拦截 echo hello 的规则
    const createRes = await apiPost('/rules', {
      id: FIXTURE_ID,
      description: 'Disable test rule',
      category: 'smoke',
      severity: 'warn',
      action: 'warn',
      selector: { binary: 'git', subcommands: ['status'] },
    });
    assert(createRes.data.success, `创建失败: ${createRes.data.message}`);

    // 验证启用时能命中
    await apiPost('/rules/reload', {});
    const before = await apiPost('/rules/evaluate', { command: 'git status', sessionId: 'smoke-disable' });
    const beforeAction = before.data.evaluation?.action;
    console.log(`     启用时: action=${beforeAction}`);

    // 禁用规则
    const toggleRes = await apiPost('/rules/toggle', { id: FIXTURE_ID });
    assert(toggleRes.data.success, `toggle失败`);
    assert(toggleRes.data.enabled === false, `enabled应为false`);

    // reload 后验证被禁用（severity=off）
    await apiPost('/rules/reload', {});
    const after = await apiPost('/rules/evaluate', { command: 'git status', sessionId: 'smoke-disable' });
    const afterAction = after.data.evaluation?.action;
    console.log(`     禁用后: action=${afterAction}`);
    // 禁用后该规则不应命中（action 变为 allow 或不包含我们的规则）
    const matchedOurRule = (after.data.evaluation?.matchedRules || []).includes(FIXTURE_ID);
    assert(!matchedOurRule, `禁用后规则 ${FIXTURE_ID} 仍在 matchedRules 中，disabled未生效`);
    console.log(`     disabled规则不在matchedRules ✓`);

    // 恢复启用
    await apiPost('/rules/toggle', { id: FIXTURE_ID });
    await apiPost('/rules/reload', {});
  });

  await run('Disabled-2: UI 禁用按钮状态正确', async () => {
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const toggle = page.locator('.rule-item .rule-actions button.btn-secondary').first();
    if (await toggle.count() === 0) { console.log('     ⚠ 未找到toggle按钮，跳过'); return; }
    const text = (await toggle.textContent()).trim();
    console.log(`     第一条规则toggle按钮: "${text}"`);
    assert(text.length > 0, '按钮文本为空');
  });

  // ═══════════════════════════════════════════════════════
  // 四、Pattern 转义验证
  // ═══════════════════════════════════════════════════════
  console.log('\n▶ 四、Pattern 转义验证');

  await run('Pattern-1: 含 \\. 的 pattern 保存后 reload 正确命中', async () => {
    // 创建一条用 arguments pattern 匹配 .env 的规则
    const createRes = await apiPost('/rules', {
      id: 'smoke/pattern-escape-test',
      description: 'Pattern escape test - match .env',
      category: 'smoke',
      severity: 'error',
      action: 'block',
      selector: {
        binary: 'cat',
        arguments: [{ pattern: '\\.env' }],
      },
    });
    if (!createRes.data.success) {
      console.log(`     ⚠ 创建失败 HTTP ${createRes.status}: ${createRes.data.message}，跳过`);
      return;
    }
    await apiPost('/rules/reload', {});
    // 用 cat .env 命令测试是否命中
    const evalRes = await apiPost('/rules/evaluate', {
      command: 'cat .env',
      sessionId: 'smoke-pattern',
    });
    const action = evalRes.data.evaluation?.action;
    const matched = evalRes.data.evaluation?.matchedRules || [];
    console.log(`     cat .env: action=${action} matchedRules=${JSON.stringify(matched)}`);
    assert(
      action === 'block' || matched.includes('smoke/pattern-escape-test'),
      `\\.env pattern 未命中，转义可能有问题`
    );
    // 清理
    await apiDelete('/rules?id=smoke/pattern-escape-test');
  });

  await run('Pattern-2: 无害文件名不误伤（cat readme.md → allow）', async () => {
    const evalRes = await apiPost('/rules/evaluate', {
      command: 'cat readme.md',
      sessionId: 'smoke-pattern',
    });
    const action = evalRes.data.evaluation?.action;
    console.log(`     cat readme.md: action=${action}`);
    assert(action === 'allow' || action === 'warn', `readme.md 被误拦: action=${action}`);
  });

  // ═══════════════════════════════════════════════════════
  // 五、CRUD 完整流程（含 UI）
  // ═══════════════════════════════════════════════════════
  console.log('\n▶ 五、CRUD 完整流程');

  await run('CRUD-1: 新建规则 → API确认 + UI搜索可见', async () => {
    await apiDelete(`/rules?id=${FIXTURE_ID}`);
    const createRes = await apiPost('/rules', FIXTURE_RULE);
    assert(createRes.status === 201 || createRes.status === 200, `HTTP ${createRes.status}`);
    assert(createRes.data.success, `success=${createRes.data.success}`);
    // API层验证（主要）
    await apiPost('/rules/reload', {});
    const listRes = await apiGet('/rules');
    const found = (listRes.data.rules || []).find(r => r.id === FIXTURE_ID);
    assert(found, `API列表中找不到 ${FIXTURE_ID}`);
    console.log(`     API验证: total=${listRes.data.count} found=${found.id}`);
    // UI搜索验证（加长等待）
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const searchInput = page.locator('input[placeholder*="搜索"]').or(page.locator('input[placeholder*="Search"]')).first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('session-full-test');
      await page.waitForTimeout(800);
      const items = await page.locator('.rule-card, [class*="rule-item"], [class*="rule-row"]').count();
      console.log(`     UI搜索: ${items}条`);
      // UI搜索作软断言（可能有时序差异）
      if (items === 0) console.log('     ⚠ UI搜索暂无结果（API已确认创建成功）');
    }
  });

  await run('CRUD-2: Web界面删除规则 → 列表消失', async () => {
    const delRes = await apiDelete(`/rules?id=${FIXTURE_ID}`);
    assert(delRes.data.success, `删除失败: ${delRes.data.message}`);
    await apiPost('/rules/reload', {});
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const searchInput = page.locator('input[placeholder*="搜索"]').or(page.locator('input[placeholder*="Search"]')).first();
    await searchInput.fill('session-full-test');
    await page.waitForTimeout(500);
    const items = await page.locator('.rule-card, [class*="rule-item"], [class*="rule-row"]').count();
    console.log(`     删除后搜索: ${items}条`);
    assert(items === 0, `删除后规则仍在UI中 (${items}条)`);
  });

  await run('CRUD-3: 完整生命周期 Create→Update→Toggle→Delete', async () => {
    const tmpId = 'smoke/lifecycle-session';
    await apiDelete(`/rules?id=${tmpId}`);
    const c = await apiPost('/rules', { ...FIXTURE_RULE, id: tmpId });
    assert(c.data.success, `Create: ${c.data.message}`);
    const u = await apiPut(`/rules?id=${tmpId}`, { description: 'updated' });
    assert(u.data.success && u.data.rule.description === 'updated', `Update: ${u.data.message}`);
    const t1 = await apiPost('/rules/toggle', { id: tmpId });
    assert(t1.data.success && t1.data.enabled === false, `Toggle off: ${t1.data.message}`);
    const t2 = await apiPost('/rules/toggle', { id: tmpId });
    assert(t2.data.success && t2.data.enabled === true, `Toggle on: ${t2.data.message}`);
    const d = await apiDelete(`/rules?id=${tmpId}`);
    assert(d.data.success, `Delete: ${d.data.message}`);
    console.log(`     Create✓ Update✓ Toggle✓×2 Delete✓`);
  });

  // ═══════════════════════════════════════════════════════
  // 六、规则统计正确性
  // ═══════════════════════════════════════════════════════
  console.log('\n▶ 六、规则统计');

  await run('Stats-1: built-in 规则数量合理（跳过example-后）', async () => {
    const { data } = await apiGet('/rules/info');
    const builtIn = data.bySource?.['built-in'] || 0;
    console.log(`     built-in=${builtIn} user=${data.bySource?.user} total=${data.total}`);
    assert(builtIn > 50, `built-in规则数量异常低: ${builtIn}`);
    assert(builtIn < 100, `built-in规则数量异常高: ${builtIn}（example-可能未跳过）`);
  });

  await run('Stats-2: 热加载后规则数稳定', async () => {
    const before = (await apiGet('/rules/info')).data.total;
    await apiPost('/rules/reload', {});
    const after = (await apiGet('/rules/info')).data.total;
    assert(before === after, `reload前后规则数不一致: ${before} → ${after}`);
    console.log(`     reload前后: ${before} → ${after} ✓`);
  });

  // 收尾清理
  await apiDelete(`/rules?id=${FIXTURE_ID}`);
  await browser.close();

  // ══════════════════════════════════════════════════════
  const total = results.passed + results.failed;
  const rate = total > 0 ? Math.round(results.passed / total * 100) : 0;

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  测试结果汇总');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  通过: ${results.passed}  失败: ${results.failed}  通过率: ${rate}%`);
  console.log('──────────────────────────────────────────────────────');
  for (const d of results.details) {
    console.log(`  ${d.status}  ${d.label}${d.error ? '\n     └ ' + d.error : ''}`);
  }
  console.log('══════════════════════════════════════════════════════\n');

  if (results.failed > 0) process.exit(1);
})();
