<template>
  <router-view />
</template>

<style>
/* Element Plus CSS – needed for programmatic APIs (ElMessage) */
@import 'element-plus/dist/index.css';

:root {
  /* Map El vars → our dark terminal palette */
  --el-color-primary: #22c55e;
  --el-color-primary-light-3: rgba(34, 197, 94, 0.6);
  --el-color-primary-light-5: rgba(34, 197, 94, 0.4);
  --el-color-primary-light-7: rgba(34, 197, 94, 0.2);
  --el-color-primary-light-9: rgba(34, 197, 94, 0.08);
  --el-color-primary-dark-2: #16a34a;
  --el-bg-color: #0f172a;
  --el-bg-color-page: #0f172a;
  --el-bg-color-overlay: #1a2540;
  --el-fill-color-blank: rgba(255,255,255,0.03);
  --el-fill-color: rgba(255,255,255,0.05);
  --el-fill-color-light: rgba(255,255,255,0.04);
  --el-text-color-primary: #ffffff;
  --el-text-color-regular: rgba(255,255,255,0.7);
  --el-text-color-secondary: rgba(255,255,255,0.4);
  --el-text-color-placeholder: rgba(255,255,255,0.25);
  --el-border-color: rgba(255,255,255,0.1);
  --el-border-color-light: rgba(255,255,255,0.07);
  --el-border-color-lighter: rgba(255,255,255,0.05);
  --el-border-radius-base: 0px;
  --el-font-family: 'JetBrains Mono', monospace;
  --el-font-size-base: 0.8rem;
}

/* ElMessage – aegis style */
.el-message {
  background: #1a2540 !important;
  border: 1px solid rgba(255,255,255,0.12) !important;
  border-radius: 0 !important;
  font-family: 'JetBrains Mono', monospace !important;
  font-size: 0.75rem !important;
  letter-spacing: 0.05em;
  min-width: 280px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.6) !important;
}
.el-message--success { border-color: rgba(34, 197, 94, 0.4) !important; }
.el-message--success .el-message__content { color: #22c55e !important; }
.el-message--success .el-message__icon { color: #22c55e !important; }
.el-message--error { border-color: rgba(220, 38, 38, 0.4) !important; }
.el-message--error .el-message__content { color: #dc2626 !important; }
.el-message--error .el-message__icon { color: #dc2626 !important; }
.el-message--warning { border-color: rgba(245, 158, 11, 0.4) !important; }
.el-message--warning .el-message__content { color: #f59e0b !important; }
.el-message--warning .el-message__icon { color: #f59e0b !important; }
.el-message--info .el-message__content { color: rgba(255,255,255,0.7) !important; }

/* ElSelect – aegis style */
.aegis-select .el-input__wrapper {
  background: transparent !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  padding: 0 0.5rem !important;
  height: 2rem !important;
}
.aegis-select .el-input__wrapper:hover,
.aegis-select .el-input__wrapper.is-focus {
  border-color: rgba(34, 197, 94, 0.4) !important;
  box-shadow: none !important;
}
.aegis-select .el-input__inner {
  font-family: 'JetBrains Mono', monospace !important;
  font-size: 0.75rem !important;
  color: rgba(255,255,255,0.7) !important;
  height: 100% !important;
}
.aegis-select .el-select__suffix { color: rgba(255,255,255,0.3) !important; }
.el-select__popper {
  background: #1a2540 !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 0 !important;
  font-family: 'JetBrains Mono', monospace !important;
}
.el-select-dropdown__item {
  font-family: 'JetBrains Mono', monospace !important;
  font-size: 0.75rem !important;
  color: rgba(255,255,255,0.7) !important;
  padding: 0 1rem !important;
  height: 2rem !important;
  line-height: 2rem !important;
}
.el-select-dropdown__item:hover,
.el-select-dropdown__item.is-hovering { background: rgba(255,255,255,0.05) !important; }
.el-select-dropdown__item.is-selected,
.el-select-dropdown__item.selected { color: #22c55e !important; background: rgba(34,197,94,0.08) !important; }

/* ElMessageBox – aegis style */
.el-overlay-message-box { backdrop-filter: blur(2px); }
.el-message-box {
  background: #1a2540 !important;
  border: 1px solid rgba(255,255,255,0.12) !important;
  border-radius: 0 !important;
  font-family: 'JetBrains Mono', monospace !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7) !important;
}
.el-message-box__title { color: #ffffff !important; font-size: 0.85rem !important; letter-spacing: 0.08em; }
.el-message-box__content { color: rgba(255,255,255,0.7) !important; font-size: 0.78rem !important; }
.el-message-box__btns .el-button {
  font-family: 'JetBrains Mono', monospace !important;
  font-size: 0.72rem !important;
  border-radius: 0 !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.el-message-box__btns .el-button--primary {
  background: var(--danger) !important;
  border-color: var(--danger) !important;
}
.el-message-box__btns .el-button--default {
  background: transparent !important;
  border-color: rgba(255,255,255,0.15) !important;
  color: rgba(255,255,255,0.6) !important;
}
.el-message-box__headerbtn .el-message-box__close { color: rgba(255,255,255,0.4) !important; }
</style>

<style>
:root {
  --bg-primary: #0f172a;
  --bg-card: rgba(255, 255, 255, 0.02);
  --bg-hover: rgba(255, 255, 255, 0.04);
  --accent-green: #22c55e;
  --accent-green-dim: rgba(34, 197, 94, 0.1);
  --accent-green-border: rgba(34, 197, 94, 0.3);
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --text-muted: rgba(255, 255, 255, 0.4);
  --border: rgba(255, 255, 255, 0.08);
  --border-accent: rgba(34, 197, 94, 0.3);
  --danger: #dc2626;
  --warning: #f59e0b;
  --info: #3b82f6;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: "JetBrains Mono", monospace;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  padding: 2rem;
  height: 100vh;
  overflow: auto;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--accent-green); }
</style>
