import { ref, watch } from 'vue';

// Module-level singleton — all components share the exact same ref instance
const lang = ref<'en' | 'zh'>(
  (localStorage.getItem('aegis-lang') as 'en' | 'zh') || 'zh'
);

watch(lang, (v) => localStorage.setItem('aegis-lang', v));

export function useLang() {
  return lang;
}
