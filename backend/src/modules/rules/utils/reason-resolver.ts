// =========================================================================
// Reason Resolver — 多语言 reason 解析
// =========================================================================

import { RuleReason, LocalizedReason } from '../types';

/**
 * 解析 rule reason，根据语言偏好返回对应文本。
 * 支持向后兼容：如果 reason 是字符串，直接返回。
 */
export function resolveReason(reason: RuleReason | undefined, lang: string = 'en'): string {
  if (!reason) {
    return 'Unknown rule';
  }

  // 向后兼容：字符串格式
  if (typeof reason === 'string') {
    return reason;
  }

  // 多语言对象
  const localized = reason as LocalizedReason;
  return localized[lang] || localized.en || localized.zh || 'Unknown rule';
}

/**
 * 检查 reason 是否为多语言对象
 */
export function isLocalizedReason(reason: RuleReason): reason is LocalizedReason {
  return typeof reason === 'object' && reason !== null && 'en' in reason;
}
