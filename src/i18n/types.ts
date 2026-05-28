export type Locale = 'zh' | 'en';

/** 支持的语言列表 */
export const SUPPORTED_LOCALES: Locale[] = ['zh', 'en'] as const;

/** 语言显示名 */
export const LOCALE_LABELS: Record<Locale, string> = {
  zh: '中文',
  en: 'English'
} as const;

import type { zh } from './locales/zh';

/** 翻译 key 集合，由 zh 字典推导 */
export type TranslationKey = keyof typeof zh;

/** 翻译参数 */
export type TranslationParams = Record<string, string>;
