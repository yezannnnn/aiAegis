<template>
  <div class="recovery-panel">
    <!-- 面板标题 -->
    <div class="panel-header">
      <div class="panel-title">💾 CODE RECOVERY</div>
      <div class="panel-status" :class="settings.enabled ? 'status-on' : 'status-off'">
        {{ settings.enabled ? 'ENABLED' : 'DISABLED' }}
      </div>
    </div>

    <!-- Settings 区块 -->
    <div class="settings-section">
      <div class="section-label">SETTINGS</div>
      <div class="setting-row">
        <span class="setting-key">ENABLE BACKUP</span>
        <label class="toggle-switch">
          <input type="checkbox" v-model="settings.enabled" />
          <span class="toggle-track">
            <span class="toggle-thumb"></span>
          </span>
          <span class="toggle-text">{{ settings.enabled ? 'ON' : 'OFF' }}</span>
        </label>
      </div>
      <div class="setting-row">
        <span class="setting-key">WATCH DIR</span>
        <input
          class="setting-input"
          v-model="settings.watchDir"
          placeholder="/absolute/path/to/project"
          :disabled="!settings.enabled"
        />
      </div>
      <div class="setting-row">
        <span class="setting-key">READ .GITIGNORE</span>
        <label class="toggle-switch">
          <input type="checkbox" v-model="settings.useGitignore" :disabled="!settings.enabled" />
          <span class="toggle-track">
            <span class="toggle-thumb"></span>
          </span>
          <span class="toggle-text">{{ settings.useGitignore ? 'ON' : 'OFF' }}</span>
        </label>
      </div>
      <div class="setting-row">
        <span class="setting-key">RETAIN</span>
        <select class="setting-select" v-model="settings.retentionDays" :disabled="!settings.enabled">
          <option value="7">7 DAYS</option>
          <option value="30">30 DAYS</option>
          <option value="90">90 DAYS</option>
          <option value="forever">FOREVER</option>
        </select>
      </div>
      <div class="setting-row setting-actions">
        <button class="btn-save" @click="saveSettings" :disabled="!settings.enabled">SAVE</button>
      </div>
    </div>

    <!-- Branch 选择器 -->
    <div class="branch-section">
      <div class="branch-selector">
        <span class="section-label">BRANCH</span>
        <select class="branch-select" v-model="currentBranch" @change="loadFiles">
          <option v-for="b in branches" :key="b" :value="b">{{ b }}</option>
        </select>
      </div>
      <button class="btn-refresh" @click="refresh" :class="{ spinning: loading }">↻</button>
    </div>

    <!-- 文件列表 -->
    <div class="files-section">
      <div v-if="!settings.enabled" class="empty-state">
        ⚠ Backup is disabled. Enable backup and set a watch directory to start recording.
      </div>
      <div v-else-if="loading" class="empty-state">
        Loading...
      </div>
      <div v-else-if="files.length === 0" class="empty-state">
        No recovery records for branch <span class="branch-name">{{ currentBranch }}</span>
      </div>
      <template v-else>
        <div v-for="file in files" :key="file.filePath" class="file-entry">
          <!-- 文件行 -->
          <div class="file-row" @click="toggleFile(file.filePath)">
            <span class="file-chevron">{{ expandedFiles.has(file.filePath) ? '▼' : '▶' }}</span>
            <span class="file-path">{{ file.filePath }}</span>
            <span v-if="file.missing" class="file-missing">⚠ FILE NOT FOUND · CAN RESTORE</span>
            <span class="file-count">{{ file.diffs.length }} change{{ file.diffs.length !== 1 ? 's' : '' }}</span>
          </div>

          <!-- Diff 链时间轴 -->
          <div v-if="expandedFiles.has(file.filePath)" class="diff-chain">
            <div class="chain-baseline">
              <span class="chain-icon">◉</span>
              <span class="chain-label">baseline</span>
              <span class="chain-meta">{{ file.filePath }} · {{ currentBranch }}</span>
            </div>

            <div v-for="diff in file.diffs.slice(0, file.pageLimit)" :key="diff.id" class="chain-entry">
              <div class="chain-line-indicator">│</div>
              <div class="chain-row">
                <span class="chain-arrow">▼</span>
                <span class="chain-stats" :class="{ positive: diff.added > 0 }">+{{ diff.added }}</span>
                <span class="chain-stats negative">-{{ diff.removed }}</span>
                <span class="chain-summary">{{ diff.commandSummary }}</span>
                <span class="chain-time">{{ formatTime(diff.timestamp) }}</span>
                <button class="btn-chain diff-btn" @click.stop="viewDiff(file, diff)">DIFF</button>
                <button class="btn-chain restore-btn" @click.stop="confirmRestore(file, diff)">RESTORE</button>
              </div>
            </div>

            <div v-if="file.diffs.length > file.pageLimit" class="load-more">
              <button class="btn-load-more" @click.stop="loadMore(file)">
                LOAD MORE ({{ file.diffs.length - file.pageLimit }} remaining)
              </button>
            </div>

            <div class="chain-current">
              <span class="chain-icon current">●</span>
              <span class="chain-label">current state</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Diff 查看 Modal -->
    <div v-if="activeDiff" class="modal-overlay" @click.self="activeDiff = null">
      <div class="diff-modal">
        <div class="diff-modal-header">
          <div class="diff-modal-title">
            <span class="diff-modal-icon">📄</span>
            {{ activeDiff.filePath }}
          </div>
          <div class="diff-modal-meta">
            {{ activeDiff.commandSummary }} · {{ formatTime(activeDiff.timestamp) }}
          </div>
          <button class="btn-close" @click="activeDiff = null">✕</button>
        </div>
        <div class="diff-modal-body">
          <DiffViewer :patch="activeDiff.patch" />
        </div>
      </div>
    </div>

    <!-- 确认恢复 Modal -->
    <div v-if="pendingRestore" class="modal-overlay" @click.self="pendingRestore = null">
      <div class="confirm-modal">
        <div class="confirm-header">⚠ CONFIRM RESTORE</div>
        <div class="confirm-body">
          <div class="confirm-row">
            <span class="confirm-key">FILE</span>
            <span class="confirm-val">{{ pendingRestore.filePath }}</span>
          </div>
          <div class="confirm-row">
            <span class="confirm-key">RESTORE TO</span>
            <span class="confirm-val">{{ formatTime(pendingRestore.timestamp) }} version</span>
          </div>
          <div class="confirm-row">
            <span class="confirm-key">CHANGE</span>
            <span class="confirm-val confirm-stats">
              +{{ pendingRestore.added }} -{{ pendingRestore.removed }}
            </span>
          </div>
          <div class="confirm-warning">
            This will overwrite the current file contents.
          </div>
        </div>
        <div class="confirm-actions">
          <button class="btn-cancel" @click="pendingRestore = null">CANCEL</button>
          <button class="btn-confirm-restore" @click="executeRestore">RESTORE</button>
        </div>
      </div>
    </div>

    <!-- 回滚回执 Modal -->
    <div v-if="rollbackReceipt" class="modal-overlay" @click.self="rollbackReceipt = null">
      <div class="receipt-modal">
        <div class="receipt-header">✅ RESTORE COMPLETE</div>
        <div class="receipt-body">
          <div class="receipt-row">
            <span class="receipt-key">FILE</span>
            <span class="receipt-val">{{ rollbackReceipt.filePath }}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-key">RESTORED TO</span>
            <span class="receipt-val">{{ rollbackReceipt.restoredAt }}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-key">CHANGES UNDONE</span>
            <span class="receipt-val">+{{ rollbackReceipt.added }} -{{ rollbackReceipt.removed }}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-key">BRANCH</span>
            <span class="receipt-val">{{ rollbackReceipt.branch }}</span>
          </div>
          <div class="receipt-note">
            File has been restored. You may need to inform your Agent of the change.
          </div>
        </div>
        <button class="btn-receipt-close" @click="rollbackReceipt = null">CLOSE</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import DiffViewer from './DiffViewer.vue'
import dayjs from 'dayjs'

const PAGE_SIZE = 20

const settings = reactive({
  enabled: false,
  watchDir: '',
  useGitignore: true,
  retentionDays: '30',
})

const currentBranch = ref('main')
const branches = ref(['main'])
const files = ref([])
const loading = ref(false)
const expandedFiles = ref(new Set())
const activeDiff = ref(null)
const pendingRestore = ref(null)
const rollbackReceipt = ref(null)

const formatTime = (ts) => dayjs(ts).format('MM-DD HH:mm')

const toggleFile = (filePath) => {
  if (expandedFiles.value.has(filePath)) {
    expandedFiles.value.delete(filePath)
  } else {
    expandedFiles.value.add(filePath)
  }
  expandedFiles.value = new Set(expandedFiles.value)
}

const loadMore = (file) => {
  file.pageLimit = (file.pageLimit || PAGE_SIZE) + PAGE_SIZE
}

const viewDiff = (file, diff) => {
  activeDiff.value = {
    filePath: file.filePath,
    commandSummary: diff.commandSummary,
    timestamp: diff.timestamp,
    patch: diff.patch,
  }
}

const confirmRestore = (file, diff) => {
  pendingRestore.value = {
    filePath: file.filePath,
    diffId: diff.id,
    timestamp: diff.timestamp,
    added: diff.added,
    removed: diff.removed,
  }
}

const executeRestore = async () => {
  if (!pendingRestore.value) return
  try {
    const res = await fetch(`/api/v1/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: pendingRestore.value.filePath,
        diffId: pendingRestore.value.diffId,
        branch: currentBranch.value,
      }),
    })
    const data = await res.json()
    rollbackReceipt.value = {
      filePath: pendingRestore.value.filePath,
      restoredAt: formatTime(pendingRestore.value.timestamp),
      added: pendingRestore.value.added,
      removed: pendingRestore.value.removed,
      branch: currentBranch.value,
    }
    pendingRestore.value = null
    await loadFiles()
  } catch (e) {
    console.error('Restore failed:', e)
  }
}

const saveSettings = async () => {
  await fetch('/api/v1/backup/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

const loadFiles = async () => {
  if (!settings.enabled) return
  loading.value = true
  try {
    const res = await fetch(`/api/v1/backup/files?branch=${currentBranch.value}`)
    const data = await res.json()
    files.value = (data.files || []).map(f => ({ ...f, pageLimit: PAGE_SIZE }))
    branches.value = data.branches || [currentBranch.value]
  } catch (e) {
    console.error('Load files failed:', e)
  } finally {
    loading.value = false
  }
}

const refresh = async () => {
  await loadFiles()
}

onMounted(async () => {
  try {
    const res = await fetch('/api/v1/backup/settings')
    const data = await res.json()
    Object.assign(settings, data)
    await loadFiles()
  } catch {
    // backend not yet implemented
  }
})
</script>

<style scoped>
.recovery-panel {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  margin: 1rem;
  position: relative;
}

/* 面板标题 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}

.panel-title {
  font-family: 'Orbitron', monospace;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent-green);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.panel-status {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border: 1px solid;
}

.panel-status.status-on {
  color: var(--accent-green);
  border-color: var(--accent-green);
  background: rgba(34, 197, 94, 0.08);
}

.panel-status.status-off {
  color: var(--text-secondary);
  border-color: var(--border);
}

/* Settings */
.settings-section {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.section-label {
  font-family: 'Orbitron', monospace;
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin-bottom: 0.75rem;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border);
}

.setting-row:last-child,
.setting-actions {
  border-bottom: none;
}

.setting-key {
  font-family: 'Orbitron', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Toggle */
.toggle-switch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.toggle-switch input {
  display: none;
}

.toggle-track {
  width: 2.2rem;
  height: 1.1rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border);
  border-radius: 0;
  position: relative;
  transition: background 0.2s;
}

.toggle-switch input:checked + .toggle-track {
  background: rgba(34, 197, 94, 0.2);
  border-color: var(--accent-green);
}

.toggle-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 0.85rem;
  height: 0.75rem;
  background: var(--text-secondary);
  transition: transform 0.2s, background 0.2s;
}

.toggle-switch input:checked + .toggle-track .toggle-thumb {
  transform: translateX(1.05rem);
  background: var(--accent-green);
}

.toggle-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--text-secondary);
  min-width: 1.5rem;
}

.toggle-switch input:checked ~ .toggle-text {
  color: var(--accent-green);
}

/* Inputs */
.setting-input {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  padding: 0.35rem 0.6rem;
  width: 55%;
  outline: none;
}

.setting-input:focus {
  border-color: var(--border-accent);
}

.setting-input:disabled {
  opacity: 0.4;
}

.setting-select {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  padding: 0.35rem 0.6rem;
  outline: none;
  cursor: pointer;
}

.setting-select:disabled {
  opacity: 0.4;
}

.btn-save {
  font-family: 'Orbitron', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--accent-green);
  border: 1px solid var(--accent-green);
  background: transparent;
  padding: 0.4rem 1rem;
  cursor: pointer;
  letter-spacing: 0.08em;
  transition: all 0.2s;
}

.btn-save:hover {
  background: var(--accent-green);
  color: var(--bg-primary);
}

.btn-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Branch */
.branch-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--border);
  gap: 1rem;
}

.branch-selector {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.branch-select {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: var(--accent-green);
  background: transparent;
  border: 1px solid var(--border-accent);
  padding: 0.3rem 0.6rem;
  outline: none;
  cursor: pointer;
}

.btn-refresh {
  font-size: 1.1rem;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border);
  padding: 0.3rem 0.7rem;
  cursor: pointer;
  transition: all 0.2s;
  font-family: monospace;
}

.btn-refresh:hover {
  color: var(--accent-green);
  border-color: var(--border-accent);
}

.btn-refresh.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Files */
.files-section {
  min-height: 6rem;
}

.empty-state {
  padding: 2rem 1.25rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-align: center;
}

.branch-name {
  color: var(--accent-green);
}

.file-entry {
  border-bottom: 1px solid var(--border);
}

.file-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1.25rem;
  cursor: pointer;
  transition: background 0.15s;
}

.file-row:hover {
  background: rgba(255, 255, 255, 0.02);
}

.file-chevron {
  font-size: 0.65rem;
  color: var(--text-secondary);
  width: 0.8rem;
  flex-shrink: 0;
}

.file-path {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: var(--text-primary);
  flex: 1;
}

.file-missing {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  color: var(--warning);
}

.file-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

/* Diff 链 */
.diff-chain {
  padding: 0.5rem 1.25rem 0.75rem 2.5rem;
  background: rgba(0, 0, 0, 0.2);
}

.chain-baseline,
.chain-current {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
}

.chain-icon {
  color: var(--text-secondary);
  font-size: 0.7rem;
}

.chain-icon.current {
  color: var(--accent-green);
}

.chain-label {
  color: var(--text-secondary);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.chain-meta {
  color: var(--text-secondary);
  opacity: 0.6;
}

.chain-entry {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}

.chain-line-indicator {
  color: var(--border);
  font-family: monospace;
  padding-top: 0.25rem;
  user-select: none;
}

.chain-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  flex-wrap: wrap;
}

.chain-arrow {
  color: var(--text-secondary);
  font-size: 0.65rem;
}

.chain-stats {
  font-size: 0.7rem;
  min-width: 2.5rem;
  color: var(--text-secondary);
}

.chain-stats.positive { color: #4ade80; }
.chain-stats.negative { color: #f87171; }

.chain-summary {
  color: var(--text-primary);
  flex: 1;
  font-size: 0.72rem;
}

.chain-time {
  color: var(--text-secondary);
  font-size: 0.68rem;
  flex-shrink: 0;
}

.btn-chain {
  font-family: 'Orbitron', monospace;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 0.2rem 0.5rem;
  border: 1px solid;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.diff-btn {
  color: var(--info);
  border-color: var(--info);
}

.diff-btn:hover {
  background: rgba(59, 130, 246, 0.15);
}

.restore-btn {
  color: var(--warning);
  border-color: var(--warning);
}

.restore-btn:hover {
  background: rgba(245, 158, 11, 0.15);
}

.load-more {
  padding: 0.4rem 0;
}

.btn-load-more {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  color: var(--text-secondary);
  background: transparent;
  border: 1px dashed var(--border);
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  width: 100%;
  text-align: center;
  transition: all 0.15s;
}

.btn-load-more:hover {
  border-color: var(--border-accent);
  color: var(--accent-green);
}

/* Modals 共用 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Diff Modal */
.diff-modal {
  background: var(--bg-primary);
  border: 1px solid var(--border-accent);
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.diff-modal-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.diff-modal-title {
  font-family: 'Orbitron', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--accent-green);
  flex: 1;
}

.diff-modal-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  color: var(--text-secondary);
}

.btn-close {
  color: var(--text-secondary);
  background: transparent;
  border: none;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  transition: color 0.15s;
}

.btn-close:hover {
  color: var(--danger);
}

.diff-modal-body {
  overflow-y: auto;
  flex: 1;
}

/* Confirm Modal */
.confirm-modal {
  background: var(--bg-primary);
  border: 1px solid var(--warning);
  width: 90%;
  max-width: 440px;
}

.confirm-header {
  font-family: 'Orbitron', monospace;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--warning);
  padding: 1rem 1.25rem;
  border-bottom: 1px solid rgba(245, 158, 11, 0.3);
  letter-spacing: 0.08em;
}

.confirm-body {
  padding: 1.25rem;
}

.confirm-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}

.confirm-row:last-of-type {
  border-bottom: none;
}

.confirm-key {
  font-family: 'Orbitron', monospace;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.confirm-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-primary);
  text-align: right;
  max-width: 60%;
  word-break: break-all;
}

.confirm-stats {
  color: var(--warning);
}

.confirm-warning {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-top: 1rem;
  padding: 0.6rem;
  border: 1px solid rgba(245, 158, 11, 0.2);
  background: rgba(245, 158, 11, 0.04);
}

.confirm-actions {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
  justify-content: flex-end;
}

.btn-cancel {
  font-family: 'Orbitron', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  background: transparent;
  padding: 0.5rem 1rem;
  cursor: pointer;
  letter-spacing: 0.06em;
  transition: all 0.15s;
}

.btn-cancel:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.btn-confirm-restore {
  font-family: 'Orbitron', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--warning);
  border: 1px solid var(--warning);
  background: transparent;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
  letter-spacing: 0.06em;
  transition: all 0.15s;
}

.btn-confirm-restore:hover {
  background: var(--warning);
  color: var(--bg-primary);
}

/* Receipt Modal */
.receipt-modal {
  background: var(--bg-primary);
  border: 1px solid var(--accent-green);
  width: 90%;
  max-width: 440px;
}

.receipt-header {
  font-family: 'Orbitron', monospace;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent-green);
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-accent);
  letter-spacing: 0.08em;
}

.receipt-body {
  padding: 1.25rem;
}

.receipt-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}

.receipt-row:last-of-type {
  border-bottom: none;
}

.receipt-key {
  font-family: 'Orbitron', monospace;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.receipt-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-primary);
  text-align: right;
  max-width: 60%;
  word-break: break-all;
}

.receipt-note {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-top: 1rem;
  padding: 0.6rem;
  border: 1px solid var(--border-accent);
  background: rgba(34, 197, 94, 0.04);
}

.btn-receipt-close {
  display: block;
  width: calc(100% - 2.5rem);
  margin: 0 1.25rem 1.25rem;
  font-family: 'Orbitron', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent-green);
  border: 1px solid var(--accent-green);
  background: transparent;
  padding: 0.6rem;
  cursor: pointer;
  letter-spacing: 0.1em;
  transition: all 0.2s;
}

.btn-receipt-close:hover {
  background: var(--accent-green);
  color: var(--bg-primary);
}
</style>
