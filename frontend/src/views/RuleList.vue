<template>
  <div class="rule-page">
    <AppHeader
      :ws-connected="wsStore?.connected ?? false"
      :notif-permission="'default'"
      :current-texts="headerTexts"
      @toggle-language="lang = lang === 'en' ? 'zh' : 'en'"
    />
    <!-- Stats -->
    <div class="stats-bar">
      <div
        class="stat-card stat-clickable"
        :class="{ 'stat-active': currentFilter === 'all' }"
        @click="filterRules('all')"
      >
        <div class="stat-number">{{ stats.total }}</div>
        <div class="stat-label">{{ texts.totalRules }}</div>
      </div>
      <div
        class="stat-card stat-clickable"
        :class="{ 'stat-active': currentFilter === 'off' }"
        @click="filterRules('off')"
      >
        <div class="stat-number" style="color: var(--text-secondary)">
          {{ stats.total - stats.active }}
        </div>
        <div class="stat-label">{{ texts.filterOff }}</div>
      </div>
      <div
        class="stat-card stat-clickable"
        :class="{ 'stat-active-danger': currentFilter === 'block' }"
        @click="filterRules('block')"
      >
        <div class="stat-number" style="color: var(--danger)">
          {{ stats.block }}
        </div>
        <div class="stat-label" style="--accent-green: var(--danger)">
          {{ texts.blockStat }}
        </div>
      </div>
      <div
        class="stat-card stat-clickable"
        :class="{ 'stat-active-warning': currentFilter === 'review' }"
        @click="filterRules('review')"
      >
        <div class="stat-number" style="color: var(--warning)">
          {{ stats.review }}
        </div>
        <div class="stat-label" style="--accent-green: var(--warning)">
          {{ texts.reviewStat }}
        </div>
      </div>
      <div
        class="stat-card stat-clickable"
        :class="{ 'stat-active-info': currentFilter === 'allow' }"
        @click="filterRules('allow')"
      >
        <div class="stat-number" style="color: var(--info)">
          {{ stats.allow }}
        </div>
        <div class="stat-label" style="--accent-green: var(--info)">
          {{ texts.allowStat }}
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <span class="toolbar-title">{{ texts.configuredRules }}</span>
      <div style="display: flex; gap: 0.75rem">
        <button
          class="btn btn-secondary btn-reload"
          @click="loadRules"
          :disabled="loading"
        >
          <span :class="{ spinning: loading }">↺</span>
          <span>{{ texts.reload.slice(2) }}</span>
        </button>
        <button class="btn btn-primary" @click="openModal()">
          {{ texts.newRule }}
        </button>
      </div>
    </div>

    <!-- Filter tabs and Search Box (same row) -->
    <div class="filter-search-section">
      <div class="filter-tabs">
        <button
          v-for="tab in filterTabs"
          :key="tab.value"
          class="filter-tab"
          :class="{
            active: currentFilter === tab.value,
            off: tab.value === 'off',
          }"
          @click="filterRules(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="search-container">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            :placeholder="texts.searchPlaceholder"
            @input="onSearchInput"
          />
          <div class="search-icon">🔍</div>
        </div>
        <div v-if="searchQuery" class="search-results">
          {{ texts.searchResults.replace('{count}', filteredRules.length) }}<!-- total matches from all rules -->
        </div>
      </div>
    </div>

    <!-- Rule List -->
    <div class="rule-list" @scroll="onRuleListScroll">
      <div v-if="loading && rules.length === 0" class="loading-state">
        {{ texts.loading }}
      </div>
      <div v-else-if="displayedRules.length === 0" class="empty-state">
        {{ texts.noRulesFound }}
      </div>
      <div
        v-for="rule in displayedRules"
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
            <span v-if="rule._source === 'built-in'" class="meta-tag builtin">
              {{ texts.builtinLabel }}
            </span>
            <span class="meta-tag category">{{ rule.category }}</span>
            <span class="meta-tag" :class="'severity-' + rule.severity">{{
              rule.severity
            }}</span>
            <span class="meta-tag" :class="'action-' + rule.action">{{
              rule.action
            }}</span>
            <span v-if="rule.contextChecks?.gitBranch" class="meta-tag context">
              BRANCH: {{ rule.contextChecks.gitBranch.join(", ") }}
            </span>
            <span
              v-if="rule.contextChecks?.isProduction"
              class="meta-tag context"
              >PRODUCTION</span
            >
          </div>
          <div
            class="rule-selector"
            v-html="formatSelector(rule.selector)"
          ></div>
        </div>
        <div class="rule-actions">
          <button
            class="btn btn-secondary btn-sm"
            @click.stop="toggleRule(rule)"
          >
            {{ isDisabled(rule) ? texts.enable : texts.disable }}
          </button>
          <button class="btn btn-danger btn-sm" @click.stop="deleteRule(rule)">
            {{ texts.delete }}
          </button>
        </div>
      </div>

      <!-- 加载更多状态 -->
      <div v-if="isLoadingMore" class="loading-more">
        {{ texts.loadingMore }}
      </div>
      <div v-else-if="!hasMoreRules && rules.length > 0 && !searchQuery" class="no-more">
        {{ texts.noMoreRules }}
      </div>
    </div>

    <!-- Modal -->
    <div
      class="modal-overlay"
      :class="{ active: showModal }"
      @click.self="closeModal"
    >
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">{{
            editingRule ? texts.editRuleTitle : texts.newRuleTitle
          }}</span>
          <button class="modal-close" @click="closeModal">×</button>
        </div>

        <div class="modal-body">
          <!-- Step 1: Parse -->
          <div class="form-section">
            <div class="section-title-sm">{{ texts.step1 }}</div>
            <div class="parse-box">
              <div class="parse-input-wrap">
                <input
                  type="text"
                  class="parse-input"
                  v-model="form.commandInput"
                  :placeholder="texts.parseInput"
                  @keyup.enter="parseCommand"
                />
                <button class="btn btn-primary btn-sm" @click="parseCommand">
                  {{ texts.parse }}
                </button>
              </div>
              <div v-if="parseResult" class="ast-tree">
                <div v-if="parseResult.hasPipes" class="pipe-warning">
                  {{ texts.pipelineDetected }}{{ parseResult.segments.length
                  }}{{ texts.pipelineSegments }}
                </div>
                <template v-for="seg in parseResult.segments" :key="seg.index">
                  <div v-if="parseResult.hasPipes" class="segment-label">
                    {{ texts.segmentLabel }}{{ seg.index }}
                  </div>
                  <AstItem
                    v-for="item in buildAstItems(seg, parseResult.hasPipes)"
                    :key="item.id"
                    :item="item"
                    :selected="isConditionSelected(item)"
                    @toggle="toggleCondition(item)"
                  />
                </template>
                <div class="parse-hint">{{ texts.clickHint }}</div>
              </div>
            </div>
          </div>

          <!-- Step 2: Conditions -->
          <div class="form-section">
            <div class="section-title-sm">{{ texts.step2 }}</div>
            <div
              class="conditions-area"
              :class="{ 'has-items': selectedConditions.length > 0 }"
            >
              <span v-if="selectedConditions.length === 0" class="empty-hint">
                {{ texts.noConditions }}
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
            <div class="match-hint">{{ texts.step2Hint }}</div>

            <div class="context-accordion">
              <button
                class="context-toggle"
                @click="showContext = !showContext"
                type="button"
              >
                <span class="ctx-arrow" :class="{ open: showContext }">▶</span>
                {{ texts.advancedContext }}
                <span
                  v-if="form.ctxGitBranch || form.ctxProduction"
                  class="ctx-active-dot"
                  >●</span
                >
              </button>
              <div v-if="showContext" class="context-section">
                <div class="field">
                  <span class="field-label">{{ texts.gitBranch }}</span>
                  <div class="radio-group">
                    <label>
                      <input
                        type="checkbox"
                        v-model="form.ctxGitBranch"
                        @change="updateYamlPreview"
                      />
                      {{ texts.gitBranch }}
                    </label>
                    <input
                      v-if="form.ctxGitBranch"
                      type="text"
                      v-model="form.ctxGitBranchValue"
                      :placeholder="texts.gitBranchPlaceholder"
                      class="context-input"
                      @input="updateYamlPreview"
                    />
                  </div>
                </div>
                <div class="field">
                  <span class="field-label"></span>
                  <div class="radio-group">
                    <label>
                      <input
                        type="checkbox"
                        v-model="form.ctxProduction"
                        @change="updateYamlPreview"
                      />
                      {{ texts.productionOnly }}
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 3: Properties -->
          <div class="form-section">
            <div class="section-title-sm">{{ texts.step3 }}</div>

            <div class="field">
              <span class="field-label"
                >{{ texts.ruleId }} <span class="required-star">*</span></span
              >
              <div
                class="field-input"
                :class="{ 'field-error': fieldErrors.ruleId }"
              >
                <input
                  type="text"
                  v-model="form.ruleId"
                  @input="
                    fieldErrors.ruleId = false;
                    updateYamlPreview();
                  "
                />
                <span v-if="fieldErrors.ruleId" class="field-error-msg">{{
                  texts.ruleIdRequired
                }}</span>
              </div>
            </div>

            <div class="field">
              <span class="field-label">{{ texts.description }} <span class="required-star">*</span></span>
              <div class="field-input">
                <input
                  type="text"
                  v-model="form.ruleDesc"
                  @input="updateYamlPreview"
                />
              </div>
            </div>

            <div class="field">
              <span class="field-label">{{ texts.category }} <span class="required-star">*</span></span>
              <div class="field-input">
                <el-select
                  v-model="form.ruleCategory"
                  @change="updateYamlPreview"
                  class="aegis-select"
                  :teleported="false"
                >
                  <el-option
                    v-for="cat in categories"
                    :key="cat"
                    :value="cat"
                    :label="cat.toUpperCase()"
                  />
                </el-select>
              </div>
            </div>

            <div class="field">
              <span class="field-label">{{ texts.severity }} <span class="required-star">*</span></span>
              <div class="radio-group">
                <label v-for="sev in severities" :key="sev">
                  <input
                    type="radio"
                    name="severity"
                    :value="sev"
                    v-model="form.severity"
                    @change="updateYamlPreview"
                  />
                  {{ sev.toUpperCase() }}
                </label>
              </div>
            </div>

            <div class="field">
              <span class="field-label">{{ texts.action }} <span class="required-star">*</span></span>
              <div class="radio-group">
                <label v-for="act in actions" :key="act">
                  <input
                    type="radio"
                    name="action"
                    :value="act"
                    v-model="form.action"
                    @change="updateYamlPreview"
                  />
                  {{ act.toUpperCase() }}
                </label>
              </div>
            </div>

            <div class="field">
              <span class="field-label">{{ texts.reasonZhLabel }}</span>
              <div class="field-input">
                <textarea
                  v-model="form.reasonZh"
                  @input="updateYamlPreview"
                ></textarea>
              </div>
            </div>

            <div class="field">
              <span class="field-label">{{ texts.reasonEnLabel }}</span>
              <div class="field-input">
                <textarea
                  v-model="form.reasonEn"
                  @input="updateYamlPreview"
                ></textarea>
              </div>
            </div>

            <div class="field">
              <span class="field-label">{{ texts.example }}</span>
              <div class="field-input">
                <input
                  type="text"
                  v-model="form.exampleCmd"
                  @input="updateYamlPreview"
                />
              </div>
            </div>
          </div>

          <!-- YAML Preview / Advanced Edit -->
          <div class="form-section">
            <div class="yaml-header">
              <div class="section-title-sm">{{ texts.generatedYaml }}</div>
              <button
                class="btn-yaml-toggle"
                :class="{ active: advancedYamlMode }"
                @click="toggleAdvancedYaml"
                type="button"
              >
                {{
                  advancedYamlMode
                    ? texts.yamlAdvancedOn
                    : texts.yamlAdvancedOff
                }}
              </button>
            </div>
            <div
              v-if="!advancedYamlMode"
              class="yaml-preview"
              v-html="yamlPreview"
            ></div>
            <textarea
              v-else
              class="yaml-edit"
              v-model="rawYamlEdit"
              @input="syncFromYaml"
              spellcheck="false"
            ></textarea>
          </div>

          <!-- Step 4: Test -->
          <div class="form-section">
            <div class="section-title-sm">{{ texts.step4 }}</div>
            <div class="test-box">
              <div class="parse-input-wrap">
                <input
                  type="text"
                  class="parse-input"
                  v-model="form.testCommand"
                  :placeholder="texts.testInput"
                  @keyup.enter="testRule"
                />
                <button class="btn btn-secondary btn-sm" @click="testRule">
                  {{ texts.test }}
                </button>
              </div>
              <div
                v-if="testResult"
                class="test-result"
                :class="{ fail: !testResult.matched }"
              >
                <div
                  :class="testResult.matched ? 'test-match' : 'test-nomatch'"
                >
                  {{ testResult.matched ? texts.matched : texts.notMatched }}
                </div>
                <div class="test-detail">
                  <div v-if="testResult.error" class="test-error">
                    {{ testResult.error }}
                  </div>
                  <template v-else>
                    <strong>CMD:</strong> <code>{{ testResult.command }}</code
                    ><br />
                    <strong>ACTION:</strong>
                    <code>{{ testResult.action }}</code> |
                    <strong>SEV:</strong> <code>{{ testResult.severity }}</code>
                    <div
                      v-if="
                        testResult.triggeredConditions &&
                        testResult.triggeredConditions.length
                      "
                      class="triggered-list"
                    >
                      <strong>{{ texts.triggeredLabel }}:</strong>
                      <code
                        v-for="(cond, i) in testResult.triggeredConditions"
                        :key="i"
                        class="triggered-tag"
                        >{{ cond }}</code
                      >
                    </div>
                  </template>
                </div>
              </div>

              <!-- Impact Scope -->
              <div v-if="hasTested" class="impact-scope">
                <div class="impact-title">
                  {{ texts.impactScope }}
                  <span class="impact-hint">— {{ texts.impactHint }}</span>
                </div>
                <div v-if="loadingImpact" class="impact-loading">
                  <span class="loading-spinner"></span>
                  {{ texts.impactLoading }}
                </div>
                <div v-else-if="!llmConfigured" class="impact-not-configured">
                  <span class="config-icon">⚙️</span>
                  {{ texts.impactNotConfigured }}
                </div>
                <div v-else class="impact-variants">
                  <span
                    v-for="v in impactVariants"
                    :key="v.cmd"
                    class="impact-badge"
                    :class="v.matched ? 'impact-hit' : 'impact-miss'"
                  >
                    <span class="impact-icon">{{ v.matched ? "✓" : "✗" }}</span>
                    <code>{{ v.cmd }}</code>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeModal">
            {{ texts.cancel }}
          </button>
          <button
            class="btn btn-primary"
            :class="{ 'btn-locked': !hasTested }"
            @click="saveRule"
            :title="!hasTested ? texts.testRequired : ''"
          >
            {{ hasTested ? texts.save : "🔒 " + texts.save }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AstItem from "../components/AstItem.vue";
import AppHeader from "../components/AppHeader.vue";
import { useLang } from "../composables/useLang";
import { useWebSocketStore } from "../stores/websocket";

// ==================== I18N ====================

const lang = useLang();
const wsStore = useWebSocketStore();

const texts = computed(() => {
  const z = lang.value === "zh";
  return {
    // header
    subtitle: z ? "规则管理" : "Rule Management",
    langSwitch: z ? "EN" : "中文",
    notifGranted: "🔔",
    notifDenied: "🔕",
    notifDefault: "🔔",
    connected: z ? "已连接" : "CONNECTED",
    disconnected: z ? "断开连接" : "DISCONNECTED",
    // stats
    totalRules: z ? "全部规则" : "TOTAL RULES",
    activeStat: z ? "已启用" : "ACTIVE",
    blockStat: z ? "拦截" : "BLOCK",
    reviewStat: z ? "审批" : "REVIEW",
    allowStat: z ? "放行" : "ALLOW",
    // toolbar
    configuredRules: z ? "已配置规则" : "CONFIGURED RULES",
    reload: z ? "↺ 重载" : "↺ RELOAD",
    newRule: z ? "+ 新建规则" : "+ NEW RULE",
    // filter tabs
    filterAll: z ? "全部" : "ALL",
    filterBlock: z ? "拦截" : "BLOCK",
    filterReview: z ? "审批" : "REVIEW",
    filterAllow: z ? "放行" : "ALLOW",
    filterOff: z ? "已禁用" : "OFF",
    // search
    searchPlaceholder: z ? "搜索规则 ID、描述、分类..." : "Search rule ID, description, category...",
    searchResults: z ? "找到 {count} 条规则" : "Found {count} rules",
    loadingMore: z ? "加载更多..." : "Loading more...",
    noMoreRules: z ? "没有更多规则了" : "No more rules",
    // rule list
    loading: z ? "加载中..." : "Loading...",
    noRulesFound: z ? "暂无规则" : "NO RULES FOUND",
    enable: z ? "启用" : "ENABLE",
    disable: z ? "禁用" : "DISABLE",
    delete: z ? "删除" : "DELETE",
    // modal
    editRuleTitle: z ? "编辑规则" : "EDIT RULE",
    newRuleTitle: z ? "新建规则" : "NEW RULE",
    // step 1
    step1: z ? "STEP 1 — 命令解析" : "STEP 1 — COMMAND PARSE",
    parseInput: z ? "输入要拦截的命令..." : "ENTER COMMAND TO INTERCEPT...",
    parse: z ? "解析" : "PARSE",
    pipelineDetected: z ? "⚠️ 检测到管道 — " : "⚠️ PIPELINE DETECTED — ",
    pipelineSegments: z ? " 段" : " SEGMENTS",
    segmentLabel: z ? "段 " : "SEGMENT ",
    clickHint: z ? "↑ 点击字段添加条件" : "↑ CLICK FIELDS TO ADD CONDITIONS",
    // step 2
    step2: z ? "STEP 2 — 匹配条件" : "STEP 2 — MATCHING CONDITIONS",
    noConditions: z
      ? "无条件 — 解析命令后点击字段添加"
      : "NO CONDITIONS — PARSE A COMMAND AND CLICK FIELDS",
    step2Hint: z
      ? "💡 额外 flags 不影响参数/子命令匹配 — 例如 rm -rf / 同样会被仅匹配 rm / 的规则拦截"
      : "💡 Extra flags do not affect argument matching — e.g. a rule targeting rm / also catches rm -rf /",
    advancedContext: z ? "▶ 高级上下文条件" : "▶ ADVANCED CONTEXT",
    context: z ? "上下文" : "CONTEXT",
    gitBranch: z ? "GIT 分支" : "GIT BRANCH",
    gitBranchPlaceholder: "main, master",
    productionOnly: z ? "仅生产环境" : "PRODUCTION ONLY",
    // step 3
    step3: z ? "STEP 3 — 规则属性" : "STEP 3 — RULE PROPERTIES",
    ruleId: z ? "规则 ID *" : "RULE ID *",
    description: z ? "描述" : "DESCRIPTION",
    category: z ? "分类" : "CATEGORY",
    severity: z ? "严重级别" : "SEVERITY",
    action: z ? "动作" : "ACTION",
    requiredMark: "*",
    reasonZhLabel: z ? "原因（中文）" : "REASON (ZH)",
    reasonEnLabel: z ? "原因（英文）" : "REASON (EN)",
    example: z ? "示例命令" : "EXAMPLE",
    // yaml + step 4
    generatedYaml: z ? "生成的 YAML" : "GENERATED YAML",
    yamlAdvancedOff: z ? "高级编辑" : "ADVANCED EDIT",
    yamlAdvancedOn: z ? "✓ 高级模式" : "✓ ADVANCED",
    step4: z ? "STEP 4 — 测试规则" : "STEP 4 — TEST RULE",
    testInput: z ? "输入测试命令..." : "ENTER TEST COMMAND...",
    test: z ? "测试" : "TEST",
    matched: z ? "✓ 已匹配" : "✓ MATCHED",
    notMatched: z ? "✗ 未匹配" : "✗ NOT MATCHED",
    triggeredLabel: z ? "触发条件" : "TRIGGERED",
    testError: z ? "测试请求失败" : "Test request failed",
    // actions
    cancel: z ? "取消" : "CANCEL",
    save: z ? "保存规则" : "SAVE RULE",
    // confirm dialogs
    confirmDelete: (id: string) =>
      z ? `确认删除规则 "${id}"？` : `Delete rule "${id}"?`,
    ruleIdRequired: z ? "规则 ID 为必填项" : "RULE ID is required",
    testRequired: z ? "请先测试规则匹配后再保存" : "Please test the rule before saving",
    saveFailed: z ? "保存失败" : "Save failed",
    // impact scope
    impactScope: z ? "影响范围" : "IMPACT SCOPE",
    impactHint: z ? "与当前规则匹配的变体命令" : "Variant commands matched by this rule",
    impactLoading: z ? "AI加载中..." : "AI COMPUTING...",
    impactNotConfigured: z ? "请到Settings配置大模型后可开启此功能" : "Please configure LLM in Settings to enable this feature",
    builtinLabel: z ? "内置" : "BUILT-IN",
    impactMatched: z ? "命中" : "HIT",
    impactMissed: z ? "未命中" : "MISS",
  };
});

const headerTexts = computed(() => ({
  subtitle: texts.value.subtitle,
  langSwitch: texts.value.langSwitch,
  notifGranted: texts.value.notifGranted,
  notifDenied: texts.value.notifDenied,
  notifDefault: texts.value.notifDefault,
  connected: texts.value.connected,
  disconnected: texts.value.disconnected,
}));

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
  type: "binary" | "subcommands" | "flags" | "arguments";
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

const categories = [
  "git",
  "docker",
  "database",
  "filesystem",
  "network",
  "package",
  "system",
  "security",
  "other",
];
const severities = ["off", "warn", "error", "block"];
const actions = ["allow", "review", "block"];

const filterTabs = computed(() => [
  { label: texts.value.filterAll, value: "all" },
  { label: texts.value.filterBlock, value: "block" },
  { label: texts.value.filterReview, value: "review" },
  { label: texts.value.filterAllow, value: "allow" },
  { label: texts.value.filterOff, value: "off" },
]);

const commonSubcommands: Record<string, string[]> = {
  git: [
    "push",
    "pull",
    "clone",
    "commit",
    "checkout",
    "reset",
    "rebase",
    "merge",
    "clean",
    "status",
    "log",
    "branch",
  ],
  docker: [
    "run",
    "exec",
    "rm",
    "rmi",
    "build",
    "compose",
    "system",
    "volume",
    "network",
    "logs",
    "ps",
  ],
  npm: [
    "install",
    "uninstall",
    "publish",
    "unpublish",
    "audit",
    "run",
    "init",
    "update",
  ],
  pip: ["install", "uninstall", "freeze", "list", "show"],
  systemctl: [
    "start",
    "stop",
    "restart",
    "status",
    "enable",
    "disable",
    "poweroff",
    "reboot",
  ],
};

// ==================== STATE ====================

const currentFilter = ref("all");
const showModal = ref(false);
const editingRule = ref<Rule | null>(null);
const parseResult = ref<ParseResult | null>(null);
const selectedConditions = ref<Condition[]>([]);
const yamlPreview = ref(
  '<span class="yaml-comment"># PARSE A COMMAND AND ADD CONDITIONS</span>'
);
const testResult = ref<any>(null);
const showContext = ref(false);
const advancedYamlMode = ref(false);
const rawYamlEdit = ref("");
const fieldErrors = reactive({ ruleId: false });

const hasTested = ref(false);
const impactVariants = ref<{ cmd: string; matched: boolean }[]>([]);
const loadingImpact = ref(false);
const llmConfigured = ref(false);

const loading = ref(false);

// 搜索状态
const searchQuery = ref('');

// 分页状态
const rulesOffset = ref(0);
const hasMoreRules = ref(true);
const isLoadingMore = ref(false);
const pageSize = 50;

const rules = ref<Rule[]>([]);

const stats = computed(() => {
  const src = allRules.value;
  const total = src.length;
  const active = src.filter((r) => r.enabled && r.severity !== 'off').length;
  const block = src.filter((r) => r.action === "block" && r.enabled && r.severity !== 'off').length;
  const review = src.filter((r) => r.action === "review" && r.enabled && r.severity !== 'off').length;
  const allow = src.filter((r) => r.action === "allow" && r.enabled && r.severity !== 'off').length;
  return { total, active, block, review, allow };
});

// 搜索/过滤始终作用于全量规则，确保自定义规则和超出首屏的规则都能被找到
const filteredRules = computed(() => {
  let filtered = allRules.value;

  if (currentFilter.value === "off") {
    filtered = filtered.filter((r) => !r.enabled || r.severity === 'off');
  } else if (currentFilter.value !== "all") {
    filtered = filtered.filter((r) => r.action === currentFilter.value && r.enabled && r.severity !== 'off');
  }

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    filtered = filtered.filter((r) =>
      (r.id ?? '').toLowerCase().includes(query) ||
      (r.description ?? '').toLowerCase().includes(query) ||
      (r.category ?? '').toLowerCase().includes(query) ||
      (r.action ?? '').toLowerCase().includes(query) ||
      (r.severity ?? '').toLowerCase().includes(query)
    );
  }

  return filtered;
});

// 展示用：有搜索/过滤时显示全部匹配结果；默认视图使用滚动分页的 rules.value
const displayedRules = computed(() => {
  const hasFilter = currentFilter.value !== "all" || searchQuery.value.trim();
  return hasFilter ? filteredRules.value : rules.value;
});

// ==================== FORM ====================

const form = reactive({
  commandInput: "git push --force origin main",
  ruleId: "",
  ruleDesc: "",
  ruleCategory: "git",
  severity: "error",
  action: "review",
  reasonZh: "",
  reasonEn: "",
  exampleCmd: "",
  ctxGitBranch: false,
  ctxGitBranchValue: "",
  ctxProduction: false,
  testCommand: "",
});

// ==================== METHODS ====================

// 搜索处理
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const onSearchInput = () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    loadRules();
  }, 300);
};

// 滚动检测
const onRuleListScroll = (e: Event) => {
  const el = e.target as HTMLElement;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
    loadMoreRules();
  }
};

const filterRules = async (filter: string) => {
  currentFilter.value = filter;
  await loadRules();
};

const isDisabled = (rule: Rule) => !rule.enabled || rule.severity === "off";

const statusClass = (rule: Rule) => {
  if (!rule.enabled || rule.severity === "off") return "status-off";
  return `status-${rule.severity}`;
};

const formatSelector = (selector: any): string => {
  if (!selector) return "";
  const parts: string[] = [];
  if (selector.binary) parts.push(`binary: <code>${selector.binary}</code>`);
  if (selector.subcommands)
    parts.push(`sub: <code>${selector.subcommands.join(", ")}</code>`);
  if (selector.flags) {
    const f = selector.flags;
    if (f.anyOf) parts.push(`flags: <code>${f.anyOf.join(", ")}</code>`);
    if (f.allOf) parts.push(`flags(all): <code>${f.allOf.join(", ")}</code>`);
  }
  if (selector.arguments) {
    parts.push(
      `args: <code>${selector.arguments
        .map((a: any) => a.pattern)
        .join(", ")}</code>`
    );
  }
  if (selector.rawPattern)
    parts.push(`raw: <code>${selector.rawPattern}</code>`);
  return parts.join(" | ");
};

const openModal = () => {
  editingRule.value = null;
  resetForm();
  showModal.value = true;
};

const reconstructCommand = (selector: any): string => {
  if (!selector) return "";
  const parts: string[] = [];
  if (selector.binary) {
    parts.push(
      Array.isArray(selector.binary) ? selector.binary[0] : selector.binary
    );
  }
  if (selector.subcommands?.length) parts.push(...selector.subcommands);
  const flags = selector.flags?.anyOf || selector.flags?.allOf || [];
  if (flags[0])
    parts.push(flags[0].length === 1 ? `-${flags[0]}` : `--${flags[0]}`);
  if (selector.arguments?.[0]) {
    const lit = selector.arguments[0].pattern
      .replace(/^\^/, "")
      .replace(/\$$/, "")
      .replace(/\(([^)]+)\)/g, (_: any, g: string) => g.split("|")[0])
      .replace(/[\\.*+?[\]{}|]/g, "")
      .trim();
    if (lit) parts.push(lit);
  }
  return parts.join(" ");
};

const autoSelectFromSelector = (selector: any) => {
  if (!selector || !parseResult.value) return;
  selectedConditions.value = [];
  const seg = parseResult.value.segments[0];
  const items = buildAstItems(seg, parseResult.value.hasPipes);

  if (selector.binary) {
    const item = items.find((i) => i.type === "binary");
    if (item) toggleCondition(item);
  }
  if (selector.subcommands?.[0]) {
    const item = items.find(
      (i) => i.type === "subcommands" && i.value === selector.subcommands[0]
    );
    if (item) toggleCondition(item);
  }
  const allFlags = [
    ...(selector.flags?.anyOf || []),
    ...(selector.flags?.allOf || []),
  ];
  for (const flagName of allFlags) {
    const item = items.find((i) => i.type === "flags" && i.value === flagName);
    if (item && !isConditionSelected(item)) toggleCondition(item);
  }
  if (selector.arguments?.length) {
    for (const argSel of selector.arguments) {
      const lit = argSel.pattern
        .replace(/^\^/, "")
        .replace(/\$$/, "")
        .replace(/[\\.*+?[\]{}|]/g, "")
        .trim();
      const item = items.find(
        (i) => i.type === "arguments" && i.value.includes(lit)
      );
      if (item && !isConditionSelected(item)) toggleCondition(item);
    }
  }
};

const editRule = (rule: Rule) => {
  editingRule.value = rule;
  form.ruleId = rule.id;
  form.ruleDesc = rule.description;
  form.ruleCategory = rule.category;
  form.severity = rule.severity;
  form.action = rule.action;
  form.reasonZh = rule.reason?.zh || "";
  form.reasonEn = rule.reason?.en || "";
  form.exampleCmd = rule.selector ? reconstructCommand(rule.selector) : "";
  form.ctxGitBranch = !!(
    rule.contextChecks?.gitBranch || rule.selector?.contextChecks?.gitBranch
  );
  form.ctxGitBranchValue =
    (
      rule.contextChecks?.gitBranch || rule.selector?.contextChecks?.gitBranch
    )?.join(", ") || "";
  form.ctxProduction = !!(
    rule.contextChecks?.isProduction ||
    rule.selector?.contextChecks?.isProduction
  );
  testResult.value = null;
  hasTested.value = false;
  impactVariants.value = [];

  // Reconstruct command from selector and parse it
  const cmd = reconstructCommand(rule.selector);
  form.commandInput = cmd || "git push --force origin main";

  if (cmd) {
    const segments = cmd
      .split(/\s*\|\s*/)
      .map((s, i) => parseSegment(s.trim(), i));
    parseResult.value = {
      raw: cmd,
      hasPipes: segments.length > 1,
      segments,
      primary: segments[0],
    };
    nextTick(() => {
      autoSelectFromSelector(rule.selector);
      updateYamlPreview();
    });
  } else {
    parseResult.value = null;
    selectedConditions.value = [];
    yamlPreview.value = generateYaml();
  }

  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  editingRule.value = null;
  advancedYamlMode.value = false;
  fieldErrors.ruleId = false;
  showContext.value = false;
  hasTested.value = false;
  impactVariants.value = [];
};

const resetForm = () => {
  form.commandInput = "git push --force origin main";
  form.ruleId = "";
  form.ruleDesc = "";
  form.ruleCategory = "git";
  form.severity = "error";
  form.action = "review";
  form.reasonZh = "";
  form.reasonEn = "";
  form.exampleCmd = "";
  form.ctxGitBranch = false;
  form.ctxGitBranchValue = "";
  form.ctxProduction = false;
  form.testCommand = "";
  selectedConditions.value = [];
  parseResult.value = null;
  testResult.value = null;
  advancedYamlMode.value = false;
  fieldErrors.ruleId = false;
  showContext.value = false;
  hasTested.value = false;
  impactVariants.value = [];
  yamlPreview.value =
    '<span class="yaml-comment"># PARSE A COMMAND AND ADD CONDITIONS</span>';
};

const API = "/api/v1/rules";

// 一次性加载所有规则
const allRules = ref<Rule[]>([]);

const loadRules = async () => {
  loading.value = true;
  try {
    const res = await fetch(API);
    const data = await res.json();
    allRules.value = data.rules || [];
    // 初始显示前50条
    rules.value = allRules.value.slice(0, pageSize);
    rulesOffset.value = pageSize;
    hasMoreRules.value = allRules.value.length > pageSize;
  } catch (e) {
    console.error("Failed to load rules:", e);
  } finally {
    loading.value = false;
  }
};

const loadMoreRules = () => {
  if (isLoadingMore.value || !hasMoreRules.value) return;

  isLoadingMore.value = true;

  // 模拟异步加载
  setTimeout(() => {
    // 加载更多数据直到我们有足够的可见结果或没有更多数据
    let nextBatch;
    let shouldContinueLoading = true;

    while (shouldContinueLoading && rulesOffset.value < allRules.value.length) {
      nextBatch = allRules.value.slice(rulesOffset.value, rulesOffset.value + pageSize);
      rules.value = [...rules.value, ...nextBatch];
      rulesOffset.value += pageSize;

      // 如果没有搜索和过滤，或者加载了足够的数据，就停止
      if (!searchQuery.value.trim() && currentFilter.value === 'all') {
        shouldContinueLoading = false;
      } else {
        // 检查过滤后的结果是否足够显示
        const currentFiltered = filteredRules.value.length;
        const previousBatchSize = nextBatch.length;

        // 如果这批数据没有增加过滤结果，继续加载
        shouldContinueLoading = previousBatchSize > 0 && currentFiltered < (Math.floor(rulesOffset.value / pageSize) * 20);
      }
    }

    if (rulesOffset.value >= allRules.value.length) {
      hasMoreRules.value = false;
    }

    isLoadingMore.value = false;
  }, 300); // 添加短暂延迟模拟加载效果
};

onMounted(() => {
  loadRules();
  // 安全连接 WebSocket
  try {
    wsStore?.connect();
  } catch (e) {
    console.warn('WebSocket 连接失败:', e);
  }
});

const toggleRule = async (rule: Rule) => {
  try {
    const res = await fetch(`${API}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id }),
    });
    const data = await res.json();
    if (data.success) await loadRules();
  } catch (e) {
    console.error("Toggle failed:", e);
  }
};

const deleteRule = async (rule: Rule) => {
  try {
    await ElMessageBox.confirm(texts.value.confirmDelete(rule.id), "", {
      confirmButtonText: texts.value.delete,
      cancelButtonText: texts.value.cancel,
      type: "warning",
      customClass: "aegis-msgbox",
    });
  } catch {
    return; // user cancelled
  }
  try {
    const res = await fetch(`${API}?id=${encodeURIComponent(rule.id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      rules.value = rules.value.filter((r) => r.id !== rule.id);
      ElMessage({ message: `Deleted: ${rule.id}`, type: "success" });
    } else {
      const data = await res.json();
      ElMessage({ message: data.message || "Delete failed", type: "error" });
    }
  } catch (e) {
    console.error("Delete failed:", e);
    ElMessage({ message: "Delete failed", type: "error" });
  }
};

// ==================== PARSE ====================

const parseCommand = () => {
  const cmd = form.commandInput.trim();
  if (!cmd) return;

  const segments = cmd
    .split(/\s*\|\s*/)
    .map((s, i) => parseSegment(s.trim(), i));
  const hasPipes = segments.length > 1;

  parseResult.value = {
    raw: cmd,
    hasPipes,
    segments,
    primary: segments[0],
  };

  // Auto-select binary and subcommands
  nextTick(() => {
    segments.forEach((seg) => {
      if (seg.binary) {
        const binaryItem = buildAstItems(seg, hasPipes).find(
          (i) => i.type === "binary"
        );
        if (binaryItem && !isConditionSelected(binaryItem))
          toggleCondition(binaryItem);
      }
    });
  });
};

const parseSegment = (raw: string, index: number): ParsedSegment => {
  const tokens = raw.split(/\s+/);
  const binary = tokens[0] || "";
  const flags: any[] = [];
  const positionalArgs: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("-")) {
      if (t.startsWith("--")) {
        flags.push({ type: "long", name: t.slice(2), raw: t });
      } else {
        const chars = t.slice(1).split("");
        chars.forEach((c) =>
          flags.push({ type: "short", name: c, raw: `-${c}` })
        );
      }
    } else {
      positionalArgs.push(t);
    }
  }

  return { index, raw, binary, flags, positionalArgs };
};

const buildAstItems = (seg: ParsedSegment, hasPipes: boolean): AstNode[] => {
  const items: AstNode[] = [];
  const prefix = hasPipes ? `seg${seg.index}_` : "";

  items.push({
    id: `${prefix}binary`,
    type: "binary",
    label: "BINARY",
    value: seg.binary,
    displayValue: seg.binary,
  });

  const subcommands = commonSubcommands[seg.binary] || [];
  const foundSub = subcommands.find((s) => seg.positionalArgs.includes(s));
  if (foundSub) {
    items.push({
      id: `${prefix}sub_${foundSub}`,
      type: "subcommands",
      label: "SUBCOMMAND",
      value: foundSub,
      displayValue: foundSub,
    });
  }

  seg.flags.forEach((f, i) => {
    items.push({
      id: `${prefix}flag_${i}`,
      type: "flags",
      label: "FLAG",
      value: f.name,
      displayValue: f.raw,
      raw: f.raw,
    });
  });

  seg.positionalArgs.forEach((arg, i) => {
    if (arg !== foundSub) {
      items.push({
        id: `${prefix}arg_${i}`,
        type: "arguments",
        label: "ARGUMENT",
        value: arg,
        displayValue: arg,
      });
    }
  });

  return items;
};

// ==================== CONDITIONS ====================

const isConditionSelected = (item: AstNode): boolean => {
  return selectedConditions.value.some((c) => c.elementId === item.id);
};

const toggleCondition = (item: AstNode) => {
  const existing = selectedConditions.value.findIndex(
    (c) => c.elementId === item.id
  );
  if (existing >= 0) {
    selectedConditions.value.splice(existing, 1);
  } else {
    let key = item.type;
    let value = item.value;
    let label = "";

    if (item.type === "binary") {
      label = `binary = "${item.value}"`;
    } else if (item.type === "subcommands") {
      label = `subcommand = "${item.value}"`;
    } else if (item.type === "flags") {
      label = `flag = "${item.raw || item.value}"`;
    } else if (item.type === "arguments") {
      label = `arg matches "${item.value}"`;
    }

    selectedConditions.value.push({
      key,
      type: item.type,
      value,
      label,
      elementId: item.id,
    });
  }
  updateYamlPreview();
};

const removeCondition = (cond: Condition) => {
  selectedConditions.value = selectedConditions.value.filter(
    (c) => c.elementId !== cond.elementId
  );
  updateYamlPreview();
};

// ==================== YAML ====================

const generateYaml = (): string => {
  const lines: string[] = [];
  lines.push(
    `<span class="yaml-key">id</span>: <span class="yaml-str">"${
      form.ruleId || "example/rule"
    }"</span>`
  );
  lines.push(
    `<span class="yaml-key">description</span>: <span class="yaml-str">"${
      form.ruleDesc || ""
    }"</span>`
  );
  lines.push(
    `<span class="yaml-key">category</span>: <span class="yaml-str">"${form.ruleCategory}"</span>`
  );
  lines.push(
    `<span class="yaml-key">severity</span>: <span class="yaml-str">"${form.severity}"</span>`
  );
  lines.push(
    `<span class="yaml-key">action</span>: <span class="yaml-str">"${form.action}"</span>`
  );

  if (form.reasonZh || form.reasonEn) {
    lines.push(`<span class="yaml-key">reason</span>:`);
    if (form.reasonZh)
      lines.push(
        `  <span class="yaml-key">zh</span>: <span class="yaml-str">"${form.reasonZh}"</span>`
      );
    if (form.reasonEn)
      lines.push(
        `  <span class="yaml-key">en</span>: <span class="yaml-str">"${form.reasonEn}"</span>`
      );
  }

  // Selector
  const binaryCond = selectedConditions.value.find((c) => c.type === "binary");
  const subCond = selectedConditions.value.find(
    (c) => c.type === "subcommands"
  );
  const flagConds = selectedConditions.value.filter((c) => c.type === "flags");
  const argConds = selectedConditions.value.filter(
    (c) => c.type === "arguments"
  );

  if (binaryCond || subCond || flagConds.length || argConds.length) {
    lines.push(`<span class="yaml-key">selector</span>:`);
    if (binaryCond)
      lines.push(
        `  <span class="yaml-key">binary</span>: <span class="yaml-str">"${binaryCond.value}"</span>`
      );
    if (subCond)
      lines.push(
        `  <span class="yaml-key">subcommands</span>: [<span class="yaml-str">"${subCond.value}"</span>]`
      );
    if (flagConds.length) {
      const flagNames = flagConds.map((c) => c.value.replace(/^-+/, ""));
      lines.push(`  <span class="yaml-key">flags</span>:`);
      lines.push(
        `    <span class="yaml-key">anyOf</span>: [${flagNames
          .map((f) => `<span class="yaml-str">"${f}"</span>`)
          .join(", ")}]`
      );
    }
    if (argConds.length) {
      lines.push(`  <span class="yaml-key">arguments</span>:`);
      argConds.forEach((c) => {
        lines.push(
          `    - <span class="yaml-key">pattern</span>: <span class="yaml-str">"${c.value}"</span>`
        );
        lines.push(
          `      <span class="yaml-key">anyPosition</span>: <span class="yaml-num">true</span>`
        );
      });
    }
  }

  // Context
  if (form.ctxGitBranch || form.ctxProduction) {
    lines.push(`<span class="yaml-key">contextChecks</span>:`);
    if (form.ctxGitBranch && form.ctxGitBranchValue) {
      const branches = form.ctxGitBranchValue
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      lines.push(
        `  <span class="yaml-key">gitBranch</span>: [${branches
          .map((b) => `<span class="yaml-str">"${b}"</span>`)
          .join(", ")}]`
      );
    }
    if (form.ctxProduction) {
      lines.push(
        `  <span class="yaml-key">isProduction</span>: <span class="yaml-num">true</span>`
      );
    }
  }

  if (form.exampleCmd) {
    lines.push(
      `<span class="yaml-key">example</span>: <span class="yaml-str">"${form.exampleCmd}"</span>`
    );
  }

  return lines.join("\n");
};

const updateYamlPreview = () => {
  yamlPreview.value = generateYaml();
  if (advancedYamlMode.value) {
    rawYamlEdit.value = yamlPreview.value.replace(/<[^>]+>/g, "");
  }
};

// ==================== YAML ADVANCED MODE ====================

const generateRawYaml = (): string => generateYaml().replace(/<[^>]+>/g, "");

const toggleAdvancedYaml = () => {
  advancedYamlMode.value = !advancedYamlMode.value;
  if (advancedYamlMode.value) {
    rawYamlEdit.value = generateRawYaml();
  }
};

const syncFromYaml = () => {
  const text = rawYamlEdit.value;
  const get = (key: string) => {
    const m = text.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, "m"));
    return m ? m[1].trim() : null;
  };
  const v = get("id");
  if (v) form.ruleId = v;
  const d = get("description");
  if (d) form.ruleDesc = d;
  const sev = get("severity");
  if (sev && ["off", "warn", "error", "block"].includes(sev))
    form.severity = sev;
  const act = get("action");
  if (act && ["allow", "review", "block"].includes(act)) form.action = act;
  const zh = get("  zh");
  if (zh) form.reasonZh = zh;
  const en = get("  en");
  if (en) form.reasonEn = en;
  const ex = get("example");
  if (ex) form.exampleCmd = ex;

  // sync selector → selectedConditions
  const binM = text.match(/^  binary:\s*"?([^"\n]+)"?/m);
  const subM = text.match(/^  subcommands:\s*\["?([^"\]]+)"?\]/m);
  const flagM = [...text.matchAll(/anyOf:\s*\[([^\]]+)\]/gm)];
  const argM = [...text.matchAll(/- pattern:\s*"?([^"\n]+)"?/gm)];

  selectedConditions.value = [];
  if (binM) {
    const val = binM[1].trim().replace(/"/g, "");
    selectedConditions.value.push({
      key: "binary",
      type: "binary",
      value: val,
      label: `binary = "${val}"`,
      elementId: "binary",
    });
  }
  if (subM) {
    const val = subM[1].trim().replace(/"/g, "");
    selectedConditions.value.push({
      key: "subcommands",
      type: "subcommands",
      value: val,
      label: `subcommand = "${val}"`,
      elementId: `sub_${val}`,
    });
  }
  flagM.forEach((m, i) => {
    const flags = m[1]
      .split(",")
      .map((f) => f.trim().replace(/"/g, ""))
      .filter(Boolean);
    flags.forEach((f, j) => {
      const raw = f.length === 1 ? `-${f}` : `--${f}`;
      selectedConditions.value.push({
        key: "flags",
        type: "flags",
        value: f,
        label: `flag = "${raw}"`,
        elementId: `flag_${i}_${j}`,
      });
    });
  });
  argM.forEach((m, i) => {
    const val = m[1].trim().replace(/"/g, "").replace(/\\\\/g, '\\');
    selectedConditions.value.push({
      key: "arguments",
      type: "arguments",
      value: val,
      label: `arg matches "${val}"`,
      elementId: `arg_${i}`,
    });
  });
  // regenerate highlighted preview from parsed form
  yamlPreview.value = generateYaml();
};

// ==================== TEST ====================

const generateVariants = (sel: any): string[] => {
  const binary = Array.isArray(sel?.binary) ? sel.binary[0] : (sel?.binary || "");
  if (!binary) return [];

  const sub = sel?.subcommands?.[0] || "";
  const args = (sel?.arguments || []).map((a: any) => {
    return a.pattern
      .replace(/^\^/, "").replace(/\$$/, "")
      .replace(/\(([^)]+)\)/g, (_: any, g: string) => g.split("|")[0])
      .replace(/[\\.*+?[\]{}|]/g, "").trim();
  });
  const base = [binary, sub, ...args].filter(Boolean).join(" ");

  const flagSets = [
    "-r", "-f", "-rf", "-fr", "-R", "-rF", "-rfv",
    "--recursive", "--force", "--recursive --force",
    "-n", "-v", "-q", "--dry-run",
    `sudo ${base}`,
    `${base} --`,
  ];

  const variants: string[] = [base];
  for (const flags of flagSets) {
    if (flags.startsWith("sudo")) {
      variants.push(flags);
    } else if (flags === `${base} --`) {
      variants.push(flags);
    } else {
      const parts = [binary];
      if (sub) parts.push(sub);
      parts.push(flags);
      parts.push(...args);
      variants.push(parts.filter(Boolean).join(" "));
    }
  }
  // deduplicate and exclude exact same as base
  return [...new Set(variants)].filter((v) => v !== base);
};

const computeImpact = async () => {
  const sel = buildSelector();
  loadingImpact.value = true;
  impactVariants.value = [];

  // Check LLM configuration first
  llmConfigured.value = false;
  let variants: string[] = [];
  try {
    const res = await fetch(`${API}/suggest-variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: form.ruleDesc,
        action: form.action,
        binary: sel.binary || "",
        subcommands: sel.subcommands || [],
        args: (sel.arguments || []).map((a: any) => a.pattern),
        flags: [...(sel.flags?.anyOf || []), ...(sel.flags?.allOf || [])],
        example: form.exampleCmd,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      llmConfigured.value = data.configured; // 更新 LLM 配置状态
      if (data.configured && data.variants?.length) {
        variants = data.variants;
      }
    }
  } catch {
    llmConfigured.value = false;
  }

  // Fallback: static variants if AI not configured or returned nothing
  if (!variants.length) {
    variants = generateVariants(sel);
  }

  if (!variants.length) {
    loadingImpact.value = false;
    return;
  }

  const draftRule = {
    id: form.ruleId || "__draft__",
    severity: form.severity,
    action: form.action,
    selector: sel,
    contextChecks: buildContext(),
  };

  try {
    const results = await Promise.all(
      variants.map(async (cmd) => {
        try {
          const res = await fetch(`${API}/test-draft`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rule: draftRule, command: cmd }),
          });
          if (!res.ok) return { cmd, matched: false };
          const data = await res.json();
          return { cmd, matched: data.matched };
        } catch {
          return { cmd, matched: false };
        }
      })
    );
    impactVariants.value = results;
  } finally {
    loadingImpact.value = false;
  }
};

const testRule = async () => {
  const cmd = form.testCommand.trim();
  if (!cmd) return;

  const draftRule = {
    id: form.ruleId || "__draft__",
    description: form.ruleDesc,
    severity: form.severity,
    action: form.action,
    selector: buildSelector(),
    contextChecks: buildContext(),
  };

  try {
    const res = await fetch(`${API}/test-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule: draftRule, command: cmd, lang: lang.value }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    testResult.value = {
      matched: data.matched,
      command: cmd,
      action: data.action,
      severity: data.severity,
      triggeredConditions: data.triggeredConditions || [],
    };
    hasTested.value = true;
    computeImpact();
  } catch (e) {
    console.error("Test failed:", e);
    testResult.value = {
      matched: false,
      command: cmd,
      action: "allow",
      severity: "off",
      triggeredConditions: [],
      error: texts.value.testError,
    };
  }
};

// ==================== SAVE ====================

const saveRule = async () => {
  if (!form.ruleId) {
    fieldErrors.ruleId = true;
    ElMessage({ message: texts.value.ruleIdRequired, type: "error" });
    return;
  }
  if (!hasTested.value) {
    ElMessage({ message: texts.value.testRequired, type: "warning" });
    return;
  }

  const sel = buildSelector();
  if (sel.arguments) {
    sel.arguments = sel.arguments.map((a: any) => ({
      ...a,
      pattern: a.pattern.replace(/\\/g, '\\\\'),
    }));
  }
  const rule = {
    id: form.ruleId,
    description: form.ruleDesc,
    category: form.ruleCategory,
    severity: form.severity,
    action: form.action,
    reason: { zh: form.reasonZh, en: form.reasonEn },
    selector: sel,
    contextChecks: buildContext(),
  };

  try {
    const isEdit = !!editingRule.value;
    const url = isEdit
      ? `${API}?id=${encodeURIComponent(editingRule.value!.id)}`
      : API;
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });

    const data = await res.json();
    if (!res.ok) {
      ElMessage({
        message: data.message || texts.value.saveFailed,
        type: "error",
      });
      return;
    }

    ElMessage({
      message: `${isEdit ? "Updated" : "Created"}: ${form.ruleId}`,
      type: "success",
    });
    await loadRules();
    closeModal();
  } catch (e) {
    console.error("Save failed:", e);
    ElMessage({ message: texts.value.saveFailed, type: "error" });
  }
};

const buildSelector = (): any => {
  const sel: any = {};
  const binaryCond = selectedConditions.value.find((c) => c.type === "binary");
  const subCond = selectedConditions.value.find(
    (c) => c.type === "subcommands"
  );
  const flagConds = selectedConditions.value.filter((c) => c.type === "flags");
  const argConds = selectedConditions.value.filter(
    (c) => c.type === "arguments"
  );

  if (binaryCond) sel.binary = binaryCond.value;
  if (subCond) sel.subcommands = [subCond.value];
  if (flagConds.length) {
    sel.flags = { anyOf: flagConds.map((c) => c.value.replace(/^-+/, "")) };
  }
  if (argConds.length) {
    sel.arguments = argConds.map((c) => ({
      pattern: c.value,
      anyPosition: true,
    }));
  }

  return sel;
};

const buildContext = (): any => {
  const ctx: any = {};
  if (form.ctxGitBranch && form.ctxGitBranchValue) {
    ctx.gitBranch = form.ctxGitBranchValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
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
.stat-clickable {
  cursor: pointer;
  user-select: none;
}
.stat-clickable:hover {
  background: var(--bg-hover);
  transform: translateY(-1px);
}
.stat-active {
  border-color: var(--accent-green) !important;
  background: var(--accent-green-dim) !important;
}
.stat-active-danger {
  border-color: var(--danger) !important;
  background: rgba(220, 38, 38, 0.08) !important;
}
.stat-active-warning {
  border-color: var(--warning) !important;
  background: rgba(245, 158, 11, 0.08) !important;
}
.stat-active-info {
  border-color: var(--info) !important;
  background: rgba(59, 130, 246, 0.08) !important;
}
.stat-number {
  font-family: "Orbitron", monospace;
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

/* Reload spinning animation */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.spinning {
  display: inline-block;
  animation: spin 0.7s linear infinite;
}
.btn-reload {
  min-width: 5.5rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  justify-content: center;
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
.filter-search-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  gap: 1rem;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .filter-search-section {
    flex-direction: column;
    gap: 1rem;
  }
}

.filter-tabs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.search-container {
  flex: 0 0 auto;
  min-width: 300px;
}
.filter-tab {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: "JetBrains Mono", monospace;
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

/* Search */

.search-box {
  position: relative;
  max-width: 400px;
}

.search-input {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 0.75rem 2.5rem 0.75rem 1rem;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent-green);
  box-shadow: 0 0 0 1px var(--accent-green-dim);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-icon {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
  font-size: 0.9rem;
}

.search-results {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
  font-family: 'JetBrains Mono', monospace;
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
.status-block {
  background: var(--danger);
}
.status-error {
  background: var(--warning);
}
.status-warn {
  background: #fbbf24;
}
.status-off {
  background: var(--text-muted);
}

.rule-main {
  min-width: 0;
}
.rule-id {
  font-family: "JetBrains Mono", monospace;
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
.meta-tag.builtin {
  color: #8b5cf6;
  border-color: rgba(139, 92, 246, 0.3);
  background: rgba(139, 92, 246, 0.05);
  font-weight: 500;
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
  font-family: "JetBrains Mono", monospace;
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
  font-family: "JetBrains Mono", monospace;
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

.loading-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-family: 'JetBrains Mono', monospace;
}

.loading-more {
  text-align: center;
  padding: 1.5rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg-card);
  border: 1px solid var(--border);
}

.no-more {
  text-align: center;
  padding: 1rem;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
}

/* 滚动优化 */
.rule-list {
  max-height: 70vh;
  overflow-y: auto;
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
  font-family: "Orbitron", monospace;
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
  font-family: "JetBrains Mono", monospace;
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
  font-family: "JetBrains Mono", monospace;
}
.condition-tag .remove {
  width: 16px;
  height: 16px;
  border-radius: 50%;
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
  font-family: "JetBrains Mono", monospace;
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
  font-family: "JetBrains Mono", monospace;
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
  font-family: "JetBrains Mono", monospace;
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
.triggered-list {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.triggered-tag {
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 2px;
  color: var(--accent-green);
  background: rgba(34, 197, 94, 0.05);
}
.test-error {
  color: var(--danger);
  font-size: 0.8rem;
}
.match-hint {
  margin-top: 0.6rem;
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 0.5rem 0.75rem;
  border-left: 2px solid rgba(96, 165, 250, 0.4);
  background: rgba(96, 165, 250, 0.04);
  line-height: 1.5;
}

/* Required field */
.required-star {
  color: var(--danger);
  margin-left: 0.2rem;
}
.field-error input,
.field-error textarea {
  border-color: var(--danger) !important;
}
.field-error-msg {
  display: block;
  font-size: 0.68rem;
  color: var(--danger);
  margin-top: 0.25rem;
}

/* Context accordion */
.context-accordion {
  margin-top: 0.75rem;
}
.context-toggle {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  padding: 0.4rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  transition: all 0.2s;
}
.context-toggle:hover {
  border-color: var(--border-accent);
  color: var(--text-secondary);
}
.ctx-arrow {
  font-size: 0.6rem;
  transition: transform 0.2s;
  display: inline-block;
}
.ctx-arrow.open {
  transform: rotate(90deg);
}
.ctx-active-dot {
  color: var(--accent-green);
  font-size: 0.6rem;
  margin-left: auto;
}

/* YAML advanced edit */
.yaml-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.btn-yaml-toggle {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  transition: all 0.2s;
}
.btn-yaml-toggle:hover {
  border-color: var(--border-accent);
  color: var(--text-secondary);
}
.btn-yaml-toggle.active {
  border-color: var(--accent-green-border);
  color: var(--accent-green);
  background: var(--accent-green-dim);
}
.yaml-edit {
  width: 100%;
  min-height: 200px;
  background: #0a0a0a;
  border: 1px solid var(--accent-green-border);
  padding: 1.25rem;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.8rem;
  line-height: 1.8;
  color: #d4d4d4;
  resize: vertical;
  outline: none;
}
.yaml-edit:focus {
  border-color: var(--accent-green);
}

/* ElMessageBox override */
:deep(.aegis-msgbox),
.aegis-msgbox {
  background: #1a2540 !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 0 !important;
  font-family: "JetBrains Mono", monospace !important;
}

/* Save button locked state */
.btn-locked {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Impact Scope */
.impact-scope {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}
.impact-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}
.impact-hint {
  color: var(--text-muted);
  font-size: 0.65rem;
  text-transform: none;
  letter-spacing: 0;
}
.impact-loading {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-style: italic;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.loading-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--border);
  border-top: 2px solid var(--accent-green);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.impact-not-configured {
  font-size: 0.72rem;
  color: var(--info);
  padding: 0.6rem 0.8rem;
  border: 1px solid rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.05);
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.config-icon {
  font-size: 14px;
}
.impact-variants {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.4rem;
}
.impact-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.55rem;
  font-size: 0.7rem;
  border: 1px solid;
  font-family: "JetBrains Mono", monospace;
}
.impact-hit {
  color: var(--accent-green);
  border-color: var(--accent-green-border);
  background: var(--accent-green-dim);
}
.impact-miss {
  color: var(--text-muted);
  border-color: var(--border);
  background: transparent;
}
.impact-icon {
  font-size: 0.65rem;
}

/* Responsive */
@media (max-width: 768px) {
  .rule-item {
    grid-template-columns: 1fr;
  }
  .field {
    flex-direction: column;
    gap: 0.5rem;
  }
  .field-label {
    width: 100%;
    padding-top: 0;
  }
  .modal {
    max-height: 100vh;
  }
}
</style>
