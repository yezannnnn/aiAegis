<template>
  <div class="settings-page">
    <AppHeader
      :ws-connected="false"
      :notif-permission="'default'"
      :current-texts="headerTexts"
      @toggle-language="lang = lang === 'en' ? 'zh' : 'en'"
    />

    <div class="settings-section">
      <div class="section-header">
        <span class="section-title">{{ t.sectionTitle }}</span>
        <span class="section-sub">— {{ t.sectionSub }}</span>
      </div>

      <!-- Provider -->
      <div class="field">
        <span class="field-label">{{ t.provider }}</span>
        <div class="provider-grid">
          <button
            v-for="p in providers"
            :key="p.id"
            class="provider-card"
            :class="{ active: form.provider === p.id }"
            @click="selectProvider(p)"
          >
            <span class="provider-name">{{ p.name }}</span>
            <span class="provider-tag">{{ p.tag }}</span>
          </button>
        </div>
      </div>

      <!-- Base URL -->
      <div class="field">
        <span class="field-label">{{ t.baseUrl }}</span>
        <div class="field-input">
          <input
            type="text"
            v-model="form.baseUrl"
            :placeholder="t.baseUrlPlaceholder"
          />
        </div>
      </div>

      <!-- API Key -->
      <div class="field">
        <span class="field-label"
          >{{ t.apiKey }} <span class="required-star">*</span></span
        >
        <div class="field-input key-wrap">
          <input
            :type="showKey ? 'text' : 'password'"
            v-model="form.apiKey"
            :placeholder="t.apiKeyPlaceholder"
            class="key-input"
            @focus="clearMaskedKey"
          />
          <button class="btn-eye" @click="showKey = !showKey" type="button">
            {{ showKey ? "🙈" : "👁" }}
          </button>
        </div>
      </div>

      <!-- Model -->
      <div class="field">
        <span class="field-label">{{ t.model }}</span>
        <div class="field-input">
          <input
            type="text"
            v-model="form.model"
            :placeholder="t.modelPlaceholder"
          />
        </div>
        <span class="field-hint">{{ currentProvider?.modelHint }}</span>
      </div>

      <!-- Status -->
      <div class="field">
        <span class="field-label">{{ t.status }}</span>
        <label class="toggle-label">
          <input type="checkbox" v-model="form.enabled" class="toggle-input" />
          <span class="toggle-track" :class="{ on: form.enabled }">
            {{ form.enabled ? t.enabled : t.disabled }}
          </span>
        </label>
      </div>

      <!-- Actions -->
      <div class="actions">
        <button
          class="btn btn-secondary"
          @click="testConnection"
          :disabled="testing || !form.apiKey"
        >
          {{ testing ? t.testing : t.testBtn }}
        </button>
        <button
          class="btn btn-primary"
          @click="saveConfig"
          :disabled="saving || !form.apiKey"
        >
          {{ saving ? t.saving : t.saveBtn }}
        </button>
      </div>

      <!-- Test result -->
      <div
        v-if="testResult"
        class="test-result"
        :class="testResult.ok ? 'ok' : 'fail'"
      >
        <template v-if="testResult.ok">
          ✓ {{ t.connected }} · {{ testResult.model }} ·
          {{ testResult.latency }}ms
        </template>
        <template v-else> ✗ {{ t.failed }}: {{ testResult.error }} </template>
      </div>
    </div>

    <!-- Info banner -->
    <div v-if="!existingConfig?.configured" class="info-banner">
      ℹ {{ t.infoBanner }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import AppHeader from "../components/AppHeader.vue";
import { useLang } from "../composables/useLang";

const lang = useLang();

// ==================== I18N ====================
const t = computed(() => {
  const z = lang.value === "zh";
  return {
    // header
    subtitle: z ? "设置" : "Settings",
    langSwitch: z ? "EN" : "中文",
    // section
    sectionTitle: z ? "LLM 配置" : "LLM CONFIG",
    sectionSub: z
      ? "为规则测试提供 AI 变体生成能力"
      : "AI variant generation for rule testing",
    // fields
    provider: z ? "服务商" : "PROVIDER",
    baseUrl: z ? "接口地址" : "BASE URL",
    baseUrlPlaceholder: "https://api.deepseek.com/v1",
    apiKey: z ? "API 密钥" : "API KEY",
    apiKeyPlaceholder: "sk-...",
    model: z ? "模型" : "MODEL",
    modelPlaceholder: z ? "模型名称..." : "Model name...",
    status: z ? "状态" : "STATUS",
    enabled: z ? "已启用" : "ENABLED",
    disabled: z ? "已禁用" : "DISABLED",
    // buttons
    testBtn: z ? "测试连接" : "TEST CONNECTION",
    testing: z ? "测试中..." : "TESTING...",
    saveBtn: z ? "保存" : "SAVE",
    saving: z ? "保存中..." : "SAVING...",
    // results
    connected: z ? "连接成功" : "Connected",
    failed: z ? "连接失败" : "Failed",
    // messages
    apiKeyRequired: z ? "API 密钥为必填项" : "API Key is required",
    saveSuccess: z ? "保存成功" : "Saved",
    saveFailed: z ? "保存失败" : "Save failed",
    // banner
    infoBanner: z
      ? "尚未配置 LLM。在上方填写 API Key 后，规则测试的影响范围将使用 AI 生成变体命令。"
      : "No LLM configured yet. Add an API key above to enable AI-powered variant generation in rule testing.",
  };
});

const headerTexts = computed(() => ({
  subtitle: t.value.subtitle,
  langSwitch: t.value.langSwitch,
  notifGranted: "🔔",
  notifDenied: "🔕",
  notifDefault: "🔔",
  connected: lang.value === "zh" ? "已连接" : "CONNECTED",
  disconnected: lang.value === "zh" ? "断开连接" : "DISCONNECTED",
}));

// ==================== PROVIDERS ====================
const providers = [
  {
    id: "deepseek",
    name: "DeepSeek",
    tag: "OpenAI compat",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    modelHint: "deepseek-chat / deepseek-reasoner",
    type: "openai-compat",
  },
  {
    id: "kimi",
    name: "Kimi",
    tag: "OpenAI compat",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    modelHint: "moonshot-v1-8k / moonshot-v1-32k",
    type: "openai-compat",
  },
  {
    id: "minimax",
    name: "Minimax",
    tag: "OpenAI compat",
    baseUrl: "https://api.minimax.chat/v1",
    model: "abab6.5s-chat",
    modelHint: "abab6.5s-chat / abab6.5-chat",
    type: "openai-compat",
  },
  {
    id: "gemini",
    name: "Gemini",
    tag: "Free tier",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-2.0-flash",
    modelHint: "gemini-2.0-flash / gemini-1.5-flash",
    type: "openai-compat",
  },
  {
    id: "openai",
    name: "ChatGPT",
    tag: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    modelHint: "gpt-4o-mini / gpt-4o",
    type: "openai-compat",
  },
  {
    id: "anthropic",
    name: "Claude",
    tag: "Anthropic",
    baseUrl: "",
    model: "claude-haiku-4-5-20251001",
    modelHint: "claude-haiku-4-5-20251001 / claude-sonnet-4-6",
    type: "anthropic",
  },
];

// ==================== STATE ====================
const form = ref({
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  model: "deepseek-chat",
  enabled: true,
});
const showKey = ref(false);
const testing = ref(false);
const saving = ref(false);
const testResult = ref<{
  ok: boolean;
  model: string;
  latency: number;
  error?: string;
} | null>(null);
const existingConfig = ref<{ configured: boolean } | null>(null);

const currentProvider = computed(() =>
  providers.find((p) => p.id === form.value.provider)
);

// ==================== METHODS ====================
const clearMaskedKey = () => {
  if (form.value.apiKey.includes('*')) form.value.apiKey = '';
};

const selectProvider = (p: (typeof providers)[0]) => {
  form.value.provider = p.id;
  form.value.baseUrl = p.baseUrl;
  form.value.model = p.model;
  testResult.value = null;
};

const loadConfig = async () => {
  try {
    const res = await fetch("/api/v1/llm/config");
    const data = await res.json();
    existingConfig.value = data;
    if (data.configured) {
      form.value.provider = data.provider || "deepseek";
      form.value.baseUrl = data.baseUrl || "";
      form.value.apiKey = data.apiKeyMasked || "";
      form.value.model = data.model || "";
      form.value.enabled = data.enabled;
    }
  } catch (e) {
    console.error("Failed to load LLM config", e);
  }
};

const saveConfig = async () => {
  if (!form.value.apiKey && !existingConfig.value?.configured) {
    ElMessage({ message: t.value.apiKeyRequired, type: "error" });
    return;
  }
  saving.value = true;
  try {
    const body: any = {
      provider: form.value.provider,
      baseUrl: form.value.baseUrl,
      model: form.value.model,
      enabled: form.value.enabled,
    };
    // 只有用户输入了新 key（不含 * 的 masked 值）才发送
    if (form.value.apiKey && !form.value.apiKey.includes('*')) body.apiKey = form.value.apiKey;
    const res = await fetch("/api/v1/llm/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      ElMessage({ message: t.value.saveSuccess, type: "success" });
      await loadConfig();
    } else {
      ElMessage({ message: t.value.saveFailed, type: "error" });
    }
  } finally {
    saving.value = false;
  }
};

const testConnection = async () => {
  testing.value = true;
  testResult.value = null;
  try {
    const res = await fetch("/api/v1/llm/test", { method: "POST" });
    testResult.value = await res.json();
  } finally {
    testing.value = false;
  }
};

onMounted(loadConfig);
</script>

<style scoped>
.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-header {
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}
.section-title {
  font-size: 0.8rem;
  color: var(--accent-green);
  letter-spacing: 0.15em;
  font-weight: 600;
}
.section-sub {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-left: 0.5rem;
}

.field {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.75rem;
  align-items: start;
}
.field-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding-top: 0.5rem;
}
.field-input input {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.8rem;
  padding: 0.5rem 0.75rem;
  outline: none;
}
.field-input input:focus {
  border-color: var(--accent-green);
}
.field-hint {
  grid-column: 2;
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-top: -0.5rem;
}

.key-wrap {
  display: flex;
}
.key-input {
  flex: 1;
  border-right: none !important;
}
.btn-eye {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 0.6rem;
  font-size: 0.8rem;
  transition: color 0.2s;
}
.btn-eye:hover {
  color: var(--text-primary);
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
.provider-card {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: "JetBrains Mono", monospace;
  cursor: pointer;
  padding: 0.6rem 0.75rem;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  transition: all 0.2s;
}
.provider-card:hover {
  border-color: var(--border-accent);
  color: var(--text-primary);
}
.provider-card.active {
  border-color: var(--accent-green);
  background: var(--accent-green-dim);
  color: var(--accent-green);
}
.provider-name {
  font-size: 0.78rem;
  font-weight: 600;
}
.provider-tag {
  font-size: 0.62rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.provider-card.active .provider-tag {
  color: rgba(34, 197, 94, 0.6);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  user-select: none;
}
.toggle-input {
  display: none;
}
.toggle-track {
  font-size: 0.72rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--border);
  color: var(--text-muted);
  letter-spacing: 0.1em;
  transition: all 0.2s;
}
.toggle-track.on {
  border-color: var(--accent-green-border);
  color: var(--accent-green);
  background: var(--accent-green-dim);
}

.actions {
  display: flex;
  gap: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.test-result {
  font-size: 0.75rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid;
}
.test-result.ok {
  color: var(--accent-green);
  border-color: var(--accent-green-border);
  background: var(--accent-green-dim);
}
.test-result.fail {
  color: var(--danger);
  border-color: rgba(220, 38, 38, 0.4);
  background: rgba(220, 38, 38, 0.05);
}

.required-star {
  color: var(--danger);
  margin-left: 0.2rem;
}

.info-banner {
  margin-top: 1.5rem;
  padding: 0.9rem 1.25rem;
  border: 1px solid rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.05);
  color: var(--info);
  font-size: 0.75rem;
  line-height: 1.6;
}

.btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-secondary:hover:not(:disabled) {
  border-color: var(--border-accent);
  color: var(--text-primary);
}
.btn-primary {
  background: var(--accent-green-dim);
  border-color: var(--accent-green-border);
  color: var(--accent-green);
}
.btn-primary:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.2);
}
</style>
