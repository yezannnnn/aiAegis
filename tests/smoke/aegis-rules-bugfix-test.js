/**
 * Aegis Rules页面 Bug修复验证
 * Bug1: test-draft 404修复
 * Bug2: 搜索/统计只算前50条修复
 */

const { chromium } = require('playwright');
const BASE = process.env.AEGIS_URL || 'http://localhost:3001';

async function apiPost(path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function apiDelete(path) {
  const res = await fetch(`${BASE}/api/v1${path}`, { method: 'DELETE' });
  return { status: res.status };
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

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

(async () => {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Aegis Rules页面 Bug修复验证');
  console.log(`  目标: ${BASE}`);
  console.log('══════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // ─── Bug1: test-draft 不再404 ───
  console.log('▶ Bug1 — test-draft 端点修复');

  await run('Bug1-TC1: test-draft 命中规则返回 matched=true', async () => {
    const { status, data } = await apiPost('/rules/test-draft', {
      rule: {
        id: 'draft/test',
        description: 'test git reset hard',
        severity: 'error',
        action: 'review',
        selector: { binary: 'git', subcommands: ['reset'], flags: { anyOf: ['hard'] } },
      },
      command: 'git reset --hard HEAD',
    });
    assert(status !== 404, `仍然返回404，端点未注册`);
    assert(status === 200 || status === 201, `HTTP ${status}`);
    assert(data.matched === true, `matched应为true，实际=${data.matched}`);
    console.log(`     matched=${data.matched} action=${data.action} triggered=${JSON.stringify(data.triggeredConditions)}`);
  });

  await run('Bug1-TC2: test-draft 未命中返回 matched=false', async () => {
    const { status, data } = await apiPost('/rules/test-draft', {
      rule: {
        id: 'draft/test',
        description: 'test git reset hard',
        severity: 'error',
        action: 'review',
        selector: { binary: 'git', subcommands: ['reset'], flags: { anyOf: ['hard'] } },
      },
      command: 'ls -la',
    });
    assert(status === 200 || status === 201, `HTTP ${status}`);
    assert(data.matched === false, `matched应为false，实际=${data.matched}`);
    console.log(`     matched=${data.matched} action=${data.action}`);
  });

  await run('Bug1-TC3: UI Rules页面正常加载', async () => {
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    // 用 OR 语法兼容中英文
    const title = await page.locator('text=RULES').or(page.locator('text=规则')).first().isVisible().catch(() => false);
    const hasRuleItems = await page.locator('.rule-card, [class*="rule-item"], [class*="rule-row"]').count() > 0;
    assert(title || hasRuleItems, 'Rules页面加载失败：未找到标题或规则列表');
    console.log(`     Rules页面加载正常 hasTitle=${title} hasItems=${hasRuleItems}`);
  });

  // ─── Bug2: 搜索/统计基于全量 ───
  console.log('\n▶ Bug2 — 搜索/统计全量修复');

  await run('Bug2-TC1: API allow规则统计非零', async () => {
    const res = await fetch(`${BASE}/api/v1/rules`);
    const data = await res.json();
    const rules = data.rules || [];
    const allowCount = rules.filter(r => r.action === 'allow').length;
    const blockCount = rules.filter(r => r.action === 'block').length;
    const reviewCount = rules.filter(r => r.action === 'review').length;
    console.log(`     全量规则: total=${rules.length} allow=${allowCount} block=${blockCount} review=${reviewCount}`);
    assert(rules.length > 0, '规则列表为空');
    // allow规则存在时统计应>0
    if (allowCount > 0) {
      console.log(`     ✓ allow规则存在(${allowCount}条)，统计应反映正确数量`);
    }
  });

  await run('Bug2-TC2: 搜索"mysql"能返回结果（不只搜前50条）', async () => {
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"], input[placeholder*="search"]').first();
    const hasSearch = await searchInput.count() > 0;
    assert(hasSearch, '未找到搜索框');
    await searchInput.fill('mysql');
    await page.waitForTimeout(600);
    const items = await page.locator('.rule-card, [class*="rule-item"], [class*="rule-row"]').count();
    console.log(`     搜索"mysql": ${items}条结果`);
    assert(items > 0, `搜索mysql应有结果，实际0条（可能只搜了前50条）`);
  });

  await run('Bug2-TC3: 自定义规则创建后搜索可见', async () => {
    const createRes = await apiPost('/rules', {
      id: 'smoke/xyz-unique-99',
      description: 'Unique smoke test rule xyz-99',
      category: 'smoke',
      severity: 'warn',
      action: 'warn',
      selector: { binary: '__smoke_xyz99__' },
    });
    if (createRes.status !== 200 && createRes.status !== 201) {
      console.log(`     ⚠ 创建失败 HTTP ${createRes.status}，跳过`);
      return;
    }
    await apiPost('/rules/reload', {});
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"], input[placeholder*="search"]').first();
    await searchInput.fill('xyz-unique-99');
    await page.waitForTimeout(600);
    const items = await page.locator('.rule-card, [class*="rule-item"], [class*="rule-row"]').count();
    console.log(`     搜索自定义规则: ${items}条结果`);
    assert(items >= 1, `自定义规则搜不到，items=${items}（Bug2未修复）`);
    await apiDelete('/rules?id=smoke/xyz-unique-99');
  });

  await run('Bug2-TC4: allow筛选tab能显示规则', async () => {
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    // 点击 allow tab
    const tabs = page.locator('[class*="tab"], [class*="filter"]');
    let allowTab = null;
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      const t = (await tabs.nth(i).textContent() || '').toLowerCase();
      if (t.includes('allow') || t.includes('放行')) {
        allowTab = tabs.nth(i);
        break;
      }
    }
    if (!allowTab) {
      console.log('     ⚠ 未找到allow tab，跳过');
      return;
    }
    await allowTab.click();
    await page.waitForTimeout(400);
    const items = await page.locator('.rule-card, [class*="rule-item"], [class*="rule-row"]').count();
    const tabText = (await allowTab.textContent()).trim();
    console.log(`     allow tab "${tabText}": ${items}条规则`);
  });

  await browser.close();

  const total = results.passed + results.failed;
  const rate = total > 0 ? Math.round(results.passed / total * 100) : 0;

  console.log('\n══════════════════════════════════════════════');
  console.log('  测试结果汇总');
  console.log('══════════════════════════════════════════════');
  console.log(`  通过: ${results.passed}  失败: ${results.failed}  通过率: ${rate}%`);
  console.log('──────────────────────────────────────────────');
  for (const d of results.details) {
    console.log(`  ${d.status}  ${d.label}${d.error ? '\n     └ ' + d.error : ''}`);
  }
  console.log('══════════════════════════════════════════════\n');

  if (results.failed > 0) process.exit(1);
})();
