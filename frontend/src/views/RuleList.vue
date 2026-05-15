<template>
  <div class="rule-page">
    <!-- Stats -->
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-number">{{ stats.total }}</div>
        <div class="stat-label">TOTAL RULES</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ stats.active }}</div>
        <div class="stat-label">ACTIVE</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" style="color:var(--danger)">{{ stats.block }}</div>
        <div class="stat-label" style="--accent-green:var(--danger)">BLOCK</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" style="color:var(--warning)">{{ stats.review }}</div>
        <div class="stat-label" style="--accent-green:var(--warning)">REVIEW</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" style="color:var(--info)">{{ stats.allow }}</div>
        <div class="stat-label" style="--accent-green:var(--info)">ALLOW</div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <span class="toolbar-title">CONFIGURED RULES</span>
      <button class="btn btn-primary" @click="openModal()">+ NEW RULE</button>
    </div>

    <!-- Filter tabs -->
    <div class="filter-tabs">
      <button
        v-for="tab in filterTabs"
        :key="tab.value"
        class="filter-tab"
        :class="{ active: currentFilter === tab.value, off: tab.value === 'off' }"
        @click="filterRules(tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Rule List -->
    <div class="rule-list">
      <div v-if="filteredRules.length === 0" class="empty-state">NO RULES FOUND</div>
      <div
        v-for="rule in filteredRules"
        :key="rule.id"
        class="rule-item"
        :class="{ disabled: isDisabled(rule) }"
        @click="editRule(rule)"
      >
        <div class="rule-status" :class="statusClass(rule)"></div>
        <div class="rule-main">
          <div class="rule-id">{{ rule.id }}</div>
          <div class="rule-desc">{{ rule.description }}</div>
          <div class="rule-meta">
            <span class="meta-tag category">{{ rule.category }}</span>
            <span class="meta-tag" :class="'severity-' + rule.severity">{{ rule.severity }}</span>
            <span class="meta-tag" :class="'action-' + rule.action">{{ rule.action }}</span>
            <span v-if="rule.contextChecks?.gitBranch" class="meta-tag context">
              BRANCH: {{ rule.contextChecks.gitBranch.join(', ') }}
            </span>
            <span v-if="rule.contextChecks?.isProduction" class="meta-tag context">PRODUCTION</span>
          </div>
          <div class="rule-selector" v-html="formatSelector(rule.selector)"></div>
        </div>
        <div class="rule-actions">
          <button
            class="btn btn-secondary btn-sm"
            @click.stop="toggleRule(rule)"
          >
            {{ isDisabled(rule) ? 'ENABLE' : 'DISABLE' }}
          </button>
          <button
            class="btn btn-danger btn-sm"
            @click.stop="deleteRule(rule)"
          >
            DELETE
          </button>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal-overlay" :class="{ active: showModal }" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">{{ editingRule ? 'EDIT RULE' : 'NEW RULE' }}</span>
          <button class="modal-close" @click="closeModal">×</button>
        </div>

        <div class="modal-body">
          <!-- Step 1: Parse -->
          <div class="form-section">
            <div class="section-title-sm">STEP 1 — COMMAND PARSE</div>
            <div class="parse-box">
              <div class="parse-input-wrap">
                <input
                  type="text"
                  class="parse-input"
                  v-model="form.commandInput"
                  placeholder="ENTER COMMAND TO INTERCEPT..."
                  @keyup.enter="parseCommand"
                />
                <button class="btn btn-primary btn-sm" @click="parseCommand">PARSE</button>
              </div>
              <div v-if="parseResult" class="ast-tree">
                <div v-if="parseResult.hasPipes" class="pipe-warning">
                  ⚠️ PIPELINE DETECTED — {{ parseResult.segments.length }} SEGMENTS
                </div>
                <template v-for="seg in parseResult.segments" :key="seg.index">
                  <div v-if="parseResult.hasPipes" class="segment-label">SEGMENT {{ seg.index }}</div>
                  <AstItem
                    v-for="item in buildAstItems(seg, parseResult.hasPipes)"
                    :key="item.id"
                    :item="item"
                    :selected="isConditionSelected(item)"
                    @toggle="toggleCondition(item)"
                  />
                </template>
                <div class="parse-hint">↑ CLICK FIELDS TO ADD CONDITIONS</div>
              </div>
            </div>
          </div>

          <!-- Step 2: Conditions -->
          <div class="form-section">
            <div class="section-title-sm">STEP 2 — MATCHING CONDITIONS</div>
            <div class="conditions-area" :class="{ 'has-items': selectedConditions.length > 0 }">
              <span v-if="selectedConditions.length === 0" class="empty-hint">
                NO CONDITIONS — PARSE A COMMAND AND CLICK FIELDS
              </span>
              <span
                v-for="cond in selectedConditions"
                :key="cond.key"
                class="condition-tag"
              >
                {{ cond.label }}
                <span class="remove" @click="removeCondition(cond)">✕</span>
              </span>
            </div>

            <div class="context-section">
              <div class="field">
                <span class="field-label">CONTEXT</span>
                <div class="radio-group">
                  <label>
                    <input type="checkbox" v-model="form.ctxGitBranch" @change="updateYamlPreview" />
                    GIT BRANCH
                  </label>
                  <input
                    v-if="form.ctxGitBranch"
                    type="text"
                    v-model="form.ctxGitBranchValue"
                    placeholder="main, master"
                    class="context-input"
                    @input="updateYamlPreview"
                  />
                </div>
              </div>
              <div class="field">
                <span class="field-label"></span>
                <div class="radio-group">
                  <label>
                    <input type="checkbox" v-model="form.ctxProduction" @change="updateYamlPreview" />
                    PRODUCTION ONLY
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 3: Properties -->
          <div class="form-section">
            <div class="section-title-sm">STEP 3 — RULE PROPERTIES</div>

            <div class="field">
              <span class="field-label">RULE ID *</span>
              <div class="field-input">
                <input type="text" v-model="form.ruleId" @input="updateYamlPreview" />
              </div>
            </div>

            <div class="field">
              <span class="field-label">DESCRIPTION</span>
              <div class="field-input">
                <input type="text" v-model="form.ruleDesc" @input="updateYamlPreview" />
              </div>
            </div>

            <div class="field">
              <span class="field-label">CATEGORY</span>
              <div class="field-input">
                <select v-model="form.ruleCategory" @change="updateYamlPreview">
                  <option v-for="cat in categories" :key="cat" :value="cat">{{ cat.toUpperCase() }}</option>
                </select>
              </div>
            </div>

            <div class="field">
              <span class="field-label">SEVERITY</span>
              <div class="radio-group">
                <label v-for="sev in severities" :key="sev">
                  <input type="radio" name="severity" :value="sev" v-model="form.severity" @change="updateYamlPreview" />
                  {{ sev.toUpperCase() }}
                </label>
              </div>
            </div>

            <div class="field">
              <span class="field-label">ACTION</span>
              <div class="radio-group">
                <label v-for="act in actions" :key="act">
                  <input type="radio" name="action" :value="act" v-model="form.action" @change="updateYamlPreview" />
                  {{ act.toUpperCase() }}
                </label>
              </div>
            </div>

            <div class="field">
              <span class="field-label">REASON (ZH)</span>
              <div class="field-input">
                <textarea v-model="form.reasonZh" @input="updateYamlPreview"></textarea>
              </div>
            </div>

            <div class="field">
              <span class="field-label">REASON (EN)</span>
              <div class="field-input">
                <textarea v-model="form.reasonEn" @input="updateYamlPreview"></textarea>
              </div>
            </div>

            <div class="field">
              <span class="field-label">EXAMPLE</span>
              <div class="field-input">
                <input type="text" v-model="form.exampleCmd" @input="updateYamlPreview" />
              </div>
            </div>
          </div>

          <!-- YAML Preview -->
          <div class="form-section">
            <div class="section-title-sm">GENERATED YAML</div>
            <div class="yaml-preview" v-html="yamlPreview"></div>
          </div>

          <!-- Step 4: Test -->
          <div class="form-section">
            <div class="section-title-sm">STEP 4 — TEST RULE</div>
            <div class="test-box">
              <div class="parse-input-wrap">
                <input
                  type="text"
                  class="parse-input"
                  v-model="form.testCommand"
                  placeholder="ENTER TEST COMMAND..."
                  @keyup.enter="testRule"
                />
                <button class="btn btn-secondary btn-sm" @click="testRule">TEST</button>
              </div>
              <div v-if="testResult" class="test-result" :class="{ fail: !testResult.matched }">
                <div :class="testResult.matched ? 'test-match' : 'test-nomatch'">
                  {{ testResult.matched ? '✓ MATCHED' : '✗ NOT MATCHED' }}
                </div>
                <div class="test-detail">
                  <strong>CMD:</strong> <code>{{ testResult.command }}</code><br>
                  <strong>ACTION:</strong> <code>{{ testResult.action }}</code> |
                  <strong>SEV:</strong> <code>{{ testResult.severity }}</code><br>
                  <div v-for="(detail, i) in testResult.details" :key="i" v-html="detail"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeModal">CANCEL</button>
          <button class="btn btn-primary" @click="saveRule">SAVE RULE</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick } from 'vue';
import AstItem from '../components/AstItem.vue';

// ==================== TYPES ====================

interface Rule {
  id: string;
  description: string;
  category: string;
  severity: string;
  action: string;
  reason?: { zh?: string; en?: string };
  selector: any;
  contextChecks?: any;
  enabled: boolean;
}

interface AstNode {
  id: string;
  type: 'binary' | 'subcommands' | 'flags' | 'arguments';
  label: string;
  value: string;
  displayValue: string;
  raw?: string;
}

interface ParsedSegment {
  index: number;
  raw: string;
  binary: string;
  flags: any[];
  positionalArgs: string[];
}

interface ParseResult {
  raw: string;
  hasPipes: boolean;
  segments: ParsedSegment[];
  primary: ParsedSegment;
}

interface Condition {
  key: string;
  type: string;
  value: string;
  label: string;
  elementId: string;
}

// ==================== CONSTANTS ====================

const categories = ['git', 'docker', 'database', 'filesystem', 'network', 'package', 'system', 'security', 'other'];
const severities = ['off', 'warn', 'error', 'block'];
const actions = ['allow', 'review', 'block'];

const filterTabs = [
  { label: 'ALL', value: 'all' },
  { label: 'BLOCK', value: 'block' },
  { label: 'REVIEW', value: 'review' },
  { label: 'ALLOW', value: 'allow' },
  { label: 'OFF', value: 'off' },
];

const commonSubcommands: Record<string, string[]> = {
  git: ['push', 'pull', 'clone', 'commit', 'checkout', 'reset', 'rebase', 'merge', 'clean', 'status', 'log', 'branch'],
  docker: ['run', 'exec', 'rm', 'rmi', 'build', 'compose', 'system', 'volume', 'network', 'logs', 'ps'],
  npm: ['install', 'uninstall', 'publish', 'unpublish', 'audit', 'run', 'init', 'update'],
  pip: ['install', 'uninstall', 'freeze', 'list', 'show'],
  systemctl: ['start', 'stop', 'restart', 'status', 'enable', 'disable', 'poweroff', 'reboot'],
};

// ==================== STATE ====================

const currentFilter = ref('all');
const showModal = ref(false);
const editingRule = ref<Rule | null>(null);
const parseResult = ref<ParseResult | null>(null);
const selectedConditions = ref<Condition[]>([]);
const yamlPreview = ref('<span class="yaml-comment"># PARSE A COMMAND AND ADD CONDITIONS</span>');
const testResult = ref<any>(null);

const rules = ref<Rule[]>([
  {
    id: 'git/force-push',
    description: '禁止强制推送到远程分支',
    category: 'git',
    severity: 'block',
    action: 'block',
    reason: { zh: '强制推送会覆盖他人提交', en: 'Force push overwrites commits' },
    selector: { binary: 'git', subcommands: ['push'], flags: { anyOf: ['force', 'f'] } },
    enabled: true,
  },
  {
    id: 'git/reset-hard',
    description: '禁止 hard reset 丢弃提交',
    category: 'git',
    severity: 'error',
    action: 'review',
    reason: { zh: 'hard reset 会丢失提交历史', en: 'Hard reset discards commit history' },
    selector: { binary: 'git', subcommands: ['reset'], flags: { anyOf: ['hard'] } },
    enabled: true,
  },
  {
    id: 'docker/exec-root',
    description: 'docker exec 以 root 身份进入容器需审批',
    category: 'docker',
    severity: 'error',
    action: 'review',
    reason: { zh: '以 root 身份进入容器存在安全风险', en: 'Running as root in container is risky' },
    selector: { binary: 'docker', subcommands: ['exec'], flags: { anyOf: ['user', 'u'] }, arguments: [{ pattern: '^root$', anyPosition: true }] },
    enabled: true,
  },
  {
    id: 'filesystem/rm-rf',
    description: '禁止递归删除目录',
    category: 'filesystem',
    severity: 'block',
    action: 'block',
    reason: { zh: 'rm -rf 极危险，可能误删重要数据', en: 'rm -rf is extremely dangerous' },
    selector: { binary: 'rm', flags: { anyOf: ['r', 'recursive'] } },
    enabled: true,
  },
  {
    id: 'database/drop-table',
    description: '禁止删除数据库表',
    category: 'database',
    severity: 'block',
    action: 'block',
    reason: { zh: 'DROP TABLE 会永久删除数据', en: 'DROP TABLE permanently deletes data' },
    selector: { binary: 'mysql', arguments: [{ pattern: 'DROP TABLE', anyPosition: true }] },
    contextChecks: { isProduction: true },
    enabled: true,
  },
  {
    id: 'network/curl-pipe',
    description: 'curl 管道到 bash 需审批',
    category: 'network',
    severity: 'warn',
    action: 'review',
    reason: { zh: '直接执行远程脚本存在安全风险', en: 'Executing remote scripts is risky' },
    selector: { binary: 'curl', rawPattern: '|.*bash' },
    enabled: true,
  },
  {
    id: 'system/reboot',
    description: '禁止重启系统',
    category: 'system',
    severity: 'block',
    action: 'block',
    reason: { zh: '重启会影响正在运行的服务', en: 'Reboot affects running services' },
    selector: { binary: 'reboot' },
    enabled: false,
  },
  {
    id: 'package/npm-force',
    description: 'npm audit fix --force 需审批',
    category: 'package',
    severity: 'warn',
    action: 'review',
    reason: { zh: '--force 可能引入不兼容更新', en: '--force may introduce breaking changes' },
    selector: { binary: 'npm', subcommands: ['audit'], flags: { anyOf: ['force'] } },
    enabled: true,
  },
  {
    id: 'security/cat-env',
    description: '防止 .env 文件泄露',
    category: 'security',
    severity: 'error',
    action: 'review',
    reason: { zh: '.env 包含敏感信息', en: '.env contains sensitive data' },
    selector: { binary: 'cat', arguments: [{ pattern: '\\.env', anyPosition: true }] },
    enabled: true,
  },
  {
    id: 'git/clean-force',
    description: 'git clean -fd 需审批',
    category: 'git',
    severity: 'warn',
    action: 'allow',
    reason: { zh: '会删除未跟踪文件', en: 'Removes untracked files' },
    selector: { binary: 'git', subcommands: ['clean'], flags: { anyOf: ['f', 'force'] } },
    enabled: true,
  },
  {
    id: 'docker/system-prune',
    description: 'docker system prune 需审批',
    category: 'docker',
    severity: 'error',
    action: 'review',
    reason: { zh: '会删除所有未使用数据', en: 'Removes all unused data' },
    selector: { binary: 'docker', subcommands: ['system'], arguments: [{ pattern: 'prune', anyPosition: true }] },
    enabled: true,
  },
  {
    id: 'filesystem/dd-disk',
    description: '禁止 dd 操作磁盘',
    category: 'filesystem',
    severity: 'block',
    action: 'block',
    reason: { zh: 'dd 可覆盖整个磁盘', en: 'dd can overwrite entire disk' },
    selector: { binary: 'dd' },
    enabled: true,
  },
]);

const stats = computed(() => {
  const total = rules.value.length;
  const active = rules.value.filter(r => r.enabled).length;
  const block = rules.value.filter(r => r.action === 'block' && r.enabled).length;
  const review = rules.value.filter(r => r.action === 'review' && r.enabled).length;
  const allow = rules.value.filter(r => r.action === 'allow' && r.enabled).length;
  return { total, active, block, review, allow };
});

const filteredRules = computed(() => {
  if (currentFilter.value === 'all') return rules.value;
  if (currentFilter.value === 'off') return rules.value.filter(r => !r.enabled);
  return rules.value.filter(r => r.action === currentFilter.value && r.enabled);
});

// ==================== FORM ====================

const form = reactive({
  commandInput: 'git push --force origin main',
  ruleId: '',
  ruleDesc: '',
  ruleCategory: 'git',
  severity: 'error',
  action: 'review',
  reasonZh: '',
  reasonEn: '',
  exampleCmd: '',
  ctxGitBranch: false,
  ctxGitBranchValue: '',
  ctxProduction: false,
  testCommand: '',
});

// ==================== METHODS ====================

const filterRules = (filter: string) => {
  currentFilter.value = filter;
};

const isDisabled = (rule: Rule) => !rule.enabled || rule.severity === 'off';

const statusClass = (rule: Rule) => {
  if (!rule.enabled || rule.severity === 'off') return 'status-off';
  return `status-${rule.severity}`;
};

const formatSelector = (selector: any): string => {
  if (!selector) return '';
  const parts: string[] = [];
  if (selector.binary) parts.push(`binary: <code>${selector.binary}</code>`);
  if (selector.subcommands) parts.push(`sub: <code>${selector.subcommands.join(', ')}</code>`);
  if (selector.flags) {
    const f = selector.flags;
    if (f.anyOf) parts.push(`flags: <code>${f.anyOf.join(', ')}</code>`);
    if (f.allOf) parts.push(`flags(all): <code>${f.allOf.join(', ')}</code>`);
  }
  if (selector.arguments) {
    parts.push(`args: <code>${selector.arguments.map((a: any) => a.pattern).join(', ')}</code>`);
  }
  if (selector.rawPattern) parts.push(`raw: <code>${selector.rawPattern}</code>`);
  return parts.join(' | ');
};

const openModal = () => {
  editingRule.value = null;
  resetForm();
  showModal.value = true;
};

const editRule = (rule: Rule) => {
  editingRule.value = rule;
  form.ruleId = rule.id;
  form.ruleDesc = rule.description;
  form.ruleCategory = rule.category;
  form.severity = rule.severity;
  form.action = rule.action;
  form.reasonZh = rule.reason?.zh || '';
  form.reasonEn = rule.reason?.en || '';
  form.exampleCmd = '';
  form.ctxGitBranch = !!rule.contextChecks?.gitBranch;
  form.ctxGitBranchValue = rule.contextChecks?.gitBranch?.join(', ') || '';
  form.ctxProduction = !!rule.contextChecks?.isProduction;
  selectedConditions.value = [];
  parseResult.value = null;
  yamlPreview.value = generateYaml();
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  editingRule.value = null;
};

const resetForm = () => {
  form.commandInput = 'git push --force origin main';
  form.ruleId = '';
  form.ruleDesc = '';
  form.ruleCategory = 'git';
  form.severity = 'error';
  form.action = 'review';
  form.reasonZh = '';
  form.reasonEn = '';
  form.exampleCmd = '';
  form.ctxGitBranch = false;
  form.ctxGitBranchValue = '';
  form.ctxProduction = false;
  form.testCommand = '';
  selectedConditions.value = [];
  parseResult.value = null;
  testResult.value = null;
  yamlPreview.value = '<span class="yaml-comment"># PARSE A COMMAND AND ADD CONDITIONS</span>';
};

const toggleRule = (rule: Rule) => {
  rule.enabled = !rule.enabled;
};

const deleteRule = (rule: Rule) => {
  if (confirm(`Delete rule "${rule.id}"?`)) {
    rules.value = rules.value.filter(r => r.id !== rule.id);
  }
};

// ==================== PARSE ====================

const parseCommand = () => {
  const cmd = form.commandInput.trim();
  if (!cmd) return;

  const segments = cmd.split(/\s*\|\s*/).map((s, i) => parseSegment(s.trim(), i));
  const hasPipes = segments.length > 1;

  parseResult.value = {
    raw: cmd,
    hasPipes,
    segments,
    primary: segments[0],
  };

  // Auto-select binary and subcommands
  nextTick(() => {
    segments.forEach(seg => {
      if (seg.binary) {
        const binaryItem = buildAstItems(seg, hasPipes).find(i => i.type === 'binary');
        if (binaryItem && !isConditionSelected(binaryItem)) toggleCondition(binaryItem);
      }
    });
  });
};

const parseSegment = (raw: string, index: number): ParsedSegment => {
  const tokens = raw.split(/\s+/);
  const binary = tokens[0] || '';
  const flags: any[] = [];
  const positionalArgs: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('-')) {
      if (t.startsWith('--')) {
        flags.push({ type: 'long', name: t.slice(2), raw: t });
      } else {
        const chars = t.slice(1).split('');
        chars.forEach(c => flags.push({ type: 'short', name: c, raw: `-${c}` }));
      }
    } else {
      positionalArgs.push(t);
    }
  }

  return { index, raw, binary, flags, positionalArgs };
};

const buildAstItems = (seg: ParsedSegment, hasPipes: boolean): AstNode[] => {
  const items: AstNode[] = [];
  const prefix = hasPipes ? `seg${seg.index}_` : '';

  items.push({
    id: `${prefix}binary`,
    type: 'binary',
    label: 'BINARY',
    value: seg.binary,
    displayValue: seg.binary,
  });

  const subcommands = commonSubcommands[seg.binary] || [];
  const foundSub = subcommands.find(s => seg.positionalArgs.includes(s));
  if (foundSub) {
    items.push({
      id: `${prefix}sub_${foundSub}`,
      type: 'subcommands',
      label: 'SUBCOMMAND',
      value: foundSub,
      displayValue: foundSub,
    });
  }

  seg.flags.forEach((f, i) => {
    items.push({
      id: `${prefix}flag_${i}`,
      type: 'flags',
      label: 'FLAG',
      value: f.name,
      displayValue: f.raw,
      raw: f.raw,
    });
  });

  seg.positionalArgs.forEach((arg, i) => {
    if (arg !== foundSub) {
      items.push({
        id: `${prefix}arg_${i}`,
        type: 'arguments',
        label: 'ARGUMENT',
        value: arg,
        displayValue: arg,
      });
    }
  });

  return items;
};

// ==================== CONDITIONS ====================

const isConditionSelected = (item: AstNode): boolean => {
  return selectedConditions.value.some(c => c.elementId === item.id);
};

const toggleCondition = (item: AstNode) => {
  const existing = selectedConditions.value.findIndex(c => c.elementId === item.id);
  if (existing >= 0) {
    selectedConditions.value.splice(existing, 1);
  } else {
    let key = item.type;
    let value = item.value;
    let label = '';

    if (item.type === 'binary') {
      label = `binary = "${item.value}"`;
    } else if (item.type === 'subcommands') {
      label = `subcommand = "${item.value}"`;
    } else if (item.type === 'flags') {
      label = `flag = "${item.raw || item.value}"`;
    } else if (item.type === 'arguments') {
      label = `arg matches "${item.value}"`;
    }

    selectedConditions.value.push({ key, type: item.type, value, label, elementId: item.id });
  }
  updateYamlPreview();
};

const removeCondition = (cond: Condition) => {
  selectedConditions.value = selectedConditions.value.filter(c => c.elementId !== cond.elementId);
  updateYamlPreview();
};

// ==================== YAML ====================

const generateYaml = (): string => {
  const lines: string[] = [];
  lines.push(`<span class="yaml-key">id</span>: <span class="yaml-str">"${form.ruleId || 'example/rule'}"</span>`);
  lines.push(`<span class="yaml-key">description</span>: <span class="yaml-str">"${form.ruleDesc || ''}"</span>`);
  lines.push(`<span class="yaml-key">category</span>: <span class="yaml-str">"${form.ruleCategory}"</span>`);
  lines.push(`<span class="yaml-key">severity</span>: <span class="yaml-str">"${form.severity}"</span>`);
  lines.push(`<span class="yaml-key">action</span>: <span class="yaml-str">"${form.action}"</span>`);

  if (form.reasonZh || form.reasonEn) {
    lines.push(`<span class="yaml-key">reason</span>:`);
    if (form.reasonZh) lines.push(`  <span class="yaml-key">zh</span>: <span class="yaml-str">"${form.reasonZh}"</span>`);
    if (form.reasonEn) lines.push(`  <span class="yaml-key">en</span>: <span class="yaml-str">"${form.reasonEn}"</span>`);
  }

  // Selector
  const binaryCond = selectedConditions.value.find(c => c.type === 'binary');
  const subCond = selectedConditions.value.find(c => c.type === 'subcommands');
  const flagConds = selectedConditions.value.filter(c => c.type === 'flags');
  const argConds = selectedConditions.value.filter(c => c.type === 'arguments');

  if (binaryCond || subCond || flagConds.length || argConds.length) {
    lines.push(`<span class="yaml-key">selector</span>:`);
    if (binaryCond) lines.push(`  <span class="yaml-key">binary</span>: <span class="yaml-str">"${binaryCond.value}"</span>`);
    if (subCond) lines.push(`  <span class="yaml-key">subcommands</span>: [<span class="yaml-str">"${subCond.value}"</span>]`);
    if (flagConds.length) {
      const flagNames = flagConds.map(c => c.value.replace(/^-+/, ''));
      lines.push(`  <span class="yaml-key">flags</span>:`);
      lines.push(`    <span class="yaml-key">anyOf</span>: [${flagNames.map(f => `<span class="yaml-str">"${f}"</span>`).join(', ')}]`);
    }
    if (argConds.length) {
      lines.push(`  <span class="yaml-key">arguments</span>:`);
      argConds.forEach(c => {
        lines.push(`    - <span class="yaml-key">pattern</span>: <span class="yaml-str">"${c.value}"</span>`);
        lines.push(`      <span class="yaml-key">anyPosition</span>: <span class="yaml-num">true</span>`);
      });
    }
  }

  // Context
  if (form.ctxGitBranch || form.ctxProduction) {
    lines.push(`<span class="yaml-key">contextChecks</span>:`);
    if (form.ctxGitBranch && form.ctxGitBranchValue) {
      const branches = form.ctxGitBranchValue.split(',').map(s => s.trim()).filter(Boolean);
      lines.push(`  <span class="yaml-key">gitBranch</span>: [${branches.map(b => `<span class="yaml-str">"${b}"</span>`).join(', ')}]`);
    }
    if (form.ctxProduction) {
      lines.push(`  <span class="yaml-key">isProduction</span>: <span class="yaml-num">true</span>`);
    }
  }

  if (form.exampleCmd) {
    lines.push(`<span class="yaml-key">example</span>: <span class="yaml-str">"${form.exampleCmd}"</span>`);
  }

  return lines.join('\n');
};

const updateYamlPreview = () => {
  yamlPreview.value = generateYaml();
};

// ==================== TEST ====================

const testRule = () => {
  const cmd = form.testCommand.trim();
  if (!cmd) return;

  const seg = parseSegment(cmd, 0);
  const binaryCond = selectedConditions.value.find(c => c.type === 'binary');
  const subCond = selectedConditions.value.find(c => c.type === 'subcommands');
  const flagConds = selectedConditions.value.filter(c => c.type === 'flags');
  const argConds = selectedConditions.value.filter(c => c.type === 'arguments');

  let matched = true;
  const details: string[] = [];

  if (binaryCond) {
    const m = seg.binary === binaryCond.value;
    details.push(`binary: ${m ? '✓' : '✗'} "${seg.binary}" ${m ? '==' : '!='} "${binaryCond.value}"`);
    if (!m) matched = false;
  }

  if (subCond && matched) {
    const subcommands = commonSubcommands[seg.binary] || [];
    const foundSub = subcommands.find(s => seg.positionalArgs.includes(s));
    const m = foundSub === subCond.value;
    details.push(`subcommand: ${m ? '✓' : '✗'} "${foundSub || 'none'}" ${m ? '==' : '!='} "${subCond.value}"`);
    if (!m) matched = false;
  }

  if (flagConds.length && matched) {
    const flagNames = seg.flags.map(f => f.name);
    flagConds.forEach(c => {
      const target = c.value.replace(/^-+/, '');
      const m = flagNames.includes(target);
      details.push(`flag "${target}": ${m ? '✓' : '✗'}`);
      if (!m) matched = false;
    });
  }

  if (argConds.length && matched) {
    argConds.forEach(c => {
      const m = seg.positionalArgs.some(a => a.includes(c.value));
      details.push(`arg "${c.value}": ${m ? '✓' : '✗'}`);
      if (!m) matched = false;
    });
  }

  testResult.value = {
    matched,
    command: cmd,
    action: matched ? form.action : 'allow',
    severity: matched ? form.severity : 'off',
    details,
  };
};

// ==================== SAVE ====================

const saveRule = () => {
  if (!form.ruleId) {
    alert('RULE ID is required');
    return;
  }

  const rule: Rule = {
    id: form.ruleId,
    description: form.ruleDesc,
    category: form.ruleCategory,
    severity: form.severity,
    action: form.action,
    reason: { zh: form.reasonZh, en: form.reasonEn },
    selector: buildSelector(),
    contextChecks: buildContext(),
    enabled: true,
  };

  if (editingRule.value) {
    const idx = rules.value.findIndex(r => r.id === editingRule.value!.id);
    if (idx >= 0) rules.value[idx] = rule;
  } else {
    rules.value.push(rule);
  }

  closeModal();
};

const buildSelector = (): any => {
  const sel: any = {};
  const binaryCond = selectedConditions.value.find(c => c.type === 'binary');
  const subCond = selectedConditions.value.find(c => c.type === 'subcommands');
  const flagConds = selectedConditions.value.filter(c => c.type === 'flags');
  const argConds = selectedConditions.value.filter(c => c.type === 'arguments');

  if (binaryCond) sel.binary = binaryCond.value;
  if (subCond) sel.subcommands = [subCond.value];
  if (flagConds.length) {
    sel.flags = { anyOf: flagConds.map(c => c.value.replace(/^-+/, '')) };
  }
  if (argConds.length) {
    sel.arguments = argConds.map(c => ({ pattern: c.value, anyPosition: true }));
  }

  return sel;
};

const buildContext = (): any => {
  const ctx: any = {};
  if (form.ctxGitBranch && form.ctxGitBranchValue) {
    ctx.gitBranch = form.ctxGitBranchValue.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (form.ctxProduction) ctx.isProduction = true;
  return Object.keys(ctx).length ? ctx : undefined;
};
</script>

<style scoped>
/* Stats */
.stats-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 1.5rem;
  text-align: center;
  transition: all 0.2s;
}
.stat-card:hover {
  border-color: var(--border-accent);
}
.stat-number {
  font-family: 'Orbitron', monospace;
  font-size: 2rem;
  font-weight: 900;
  color: var(--accent-green);
  margin-bottom: 0.5rem;
}
.stat-label {
  font-size: 0.7rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

/* Toolbar */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}
.toolbar-title {
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

/* Filter tabs */
.filter-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}
.filter-tab {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  transition: all 0.2s;
}
.filter-tab:hover {
  border-color: var(--border-accent);
  color: var(--accent-green);
}
.filter-tab.active {
  border-color: var(--accent-green);
  color: var(--accent-green);
  background: var(--accent-green-dim);
}
.filter-tab.off:hover {
  border-color: var(--danger);
  color: var(--danger);
}

/* Rule list */
.rule-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.rule-item {
  display: grid;
  grid-template-columns: 4px 1fr auto;
  gap: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 1rem 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
  align-items: start;
}
.rule-item:hover {
  border-color: var(--border-accent);
  background: var(--bg-hover);
}
.rule-item.disabled {
  opacity: 0.4;
}
.rule-status {
  width: 4px;
  height: 100%;
  min-height: 40px;
}
.status-block { background: var(--danger); }
.status-error { background: var(--warning); }
.status-warn { background: #fbbf24; }
.status-off { background: var(--text-muted); }

.rule-main {
  min-width: 0;
}
.rule-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}
.rule-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}
.rule-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.meta-tag {
  font-size: 0.65rem;
  padding: 0.2rem 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid var(--border);
}
.meta-tag.category {
  color: #60a5fa;
  border-color: rgba(96, 165, 250, 0.3);
}
.meta-tag.severity-block {
  color: var(--danger);
  border-color: rgba(220, 38, 38, 0.3);
}
.meta-tag.severity-error {
  color: var(--warning);
  border-color: rgba(245, 158, 11, 0.3);
}
.meta-tag.severity-warn {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.3);
}
.meta-tag.severity-off {
  color: var(--text-muted);
}
.meta-tag.action-block {
  background: rgba(220, 38, 38, 0.1);
  color: var(--danger);
}
.meta-tag.action-review {
  background: rgba(245, 158, 11, 0.1);
  color: var(--warning);
}
.meta-tag.action-allow {
  background: rgba(34, 197, 94, 0.1);
  color: var(--accent-green);
}
.meta-tag.context {
  color: #a78bfa;
  border-color: rgba(167, 139, 250, 0.3);
}
.rule-selector {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}
.rule-selector code {
  color: var(--accent-green);
  background: rgba(34, 197, 94, 0.05);
  padding: 0.1rem 0.3rem;
}
.rule-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

/* Buttons */
.btn {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  padding: 0.6rem 1.2rem;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  transition: all 0.2s;
}
.btn:hover {
  border-color: var(--border-accent);
  color: var(--accent-green);
}
.btn-primary {
  background: var(--accent-green-dim);
  border-color: var(--accent-green-border);
  color: var(--accent-green);
}
.btn-primary:hover {
  background: var(--accent-green);
  color: var(--bg-primary);
}
.btn-secondary {
  border-color: var(--border);
}
.btn-danger {
  color: var(--danger);
  border-color: rgba(220, 38, 38, 0.3);
}
.btn-danger:hover {
  background: rgba(220, 38, 38, 0.1);
}
.btn-sm {
  padding: 0.4rem 0.8rem;
  font-size: 0.65rem;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-muted);
  font-size: 0.85rem;
  border: 1px dashed var(--border);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
}
.modal-overlay.active {
  display: flex;
}
.modal {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg-primary);
  z-index: 10;
}
.modal-title {
  font-family: 'Orbitron', monospace;
  font-size: 0.9rem;
  letter-spacing: 0.1em;
}
.modal-close {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 1.2rem;
  width: 2rem;
  height: 2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-close:hover {
  border-color: var(--danger);
  color: var(--danger);
}
.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  flex: 1;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1.25rem;
  border-top: 1px solid var(--border);
  position: sticky;
  bottom: 0;
  background: var(--bg-primary);
}

/* Form sections */
.form-section {
  margin-bottom: 2rem;
}
.section-title-sm {
  font-size: 0.7rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}

/* Parse box */
.parse-box {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 1rem;
}
.parse-input-wrap {
  display: flex;
  gap: 0.75rem;
}
.parse-input {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  padding: 0.75rem 1rem;
  outline: none;
}
.parse-input:focus {
  border-color: var(--accent-green);
}
.parse-input::placeholder {
  color: var(--text-muted);
}
.ast-tree {
  margin-top: 1rem;
}
.pipe-warning {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: var(--warning);
  padding: 0.75rem;
  font-size: 0.8rem;
  margin-bottom: 0.75rem;
}
.segment-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0.75rem 0 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--border);
}
.parse-hint {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 0.75rem;
  text-align: center;
}

/* Conditions */
.conditions-area {
  min-height: 50px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px dashed var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.conditions-area.has-items {
  border-style: solid;
}
.empty-hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  width: 100%;
  text-align: center;
}
.condition-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: var(--accent-green-dim);
  border: 1px solid var(--accent-green-border);
  color: var(--accent-green);
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
}
.condition-tag .remove {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--danger);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 10px;
}

/* Context */
.context-section {
  margin-top: 1rem;
}
.context-input {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  padding: 0.5rem;
  margin-left: 0.5rem;
  width: 200px;
}

/* Field */
.field {
  display: flex;
  align-items: flex-start;
  margin-bottom: 1rem;
}
.field-label {
  width: 130px;
  padding-top: 0.6rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.field-input {
  flex: 1;
  max-width: 500px;
}
.field-input input,
.field-input select,
.field-input textarea {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  padding: 0.6rem 0.75rem;
  outline: none;
}
.field-input input:focus,
.field-input select:focus,
.field-input textarea:focus {
  border-color: var(--accent-green);
}
.field-input textarea {
  height: 70px;
  resize: vertical;
}
.field-input select {
  max-width: 200px;
}

/* Radio group */
.radio-group {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  padding-top: 0.5rem;
}
.radio-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--text-secondary);
}
.radio-group input[type="radio"],
.radio-group input[type="checkbox"] {
  accent-color: var(--accent-green);
}

/* YAML preview */
.yaml-preview {
  background: #0a0a0a;
  border: 1px solid var(--border);
  padding: 1.25rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  line-height: 1.8;
  overflow-x: auto;
  white-space: pre;
  color: #d4d4d4;
}
.yaml-preview .yaml-key {
  color: #9cdcfe;
}
.yaml-preview .yaml-str {
  color: #ce9178;
}
.yaml-preview .yaml-num {
  color: #b5cea8;
}
.yaml-preview .yaml-comment {
  color: #6a9955;
}

/* Test */
.test-box {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 1rem;
}
.test-result {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--bg-primary);
  border-left: 3px solid var(--accent-green);
}
.test-result.fail {
  border-left-color: var(--danger);
}
.test-match {
  color: var(--accent-green);
  font-weight: 700;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}
.test-nomatch {
  color: var(--danger);
  font-weight: 700;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}
.test-detail {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.8;
}
.test-detail code {
  color: var(--accent-green);
  background: rgba(34, 197, 94, 0.05);
  padding: 0.1rem 0.3rem;
}

/* Responsive */
@media (max-width: 768px) {
  .rule-item { grid-template-columns: 1fr; }
  .field { flex-direction: column; gap: 0.5rem; }
  .field-label { width: 100%; padding-top: 0; }
  .modal { max-height: 100vh; }
}
</style>
