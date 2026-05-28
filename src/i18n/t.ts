import { zh } from './locales/zh';
import { en } from './locales/en';
import type { Locale, TranslationKey, TranslationParams } from './types';

const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  zh,
  en
};

/**
 * 非 React 纯函数翻译。
 *
 * - 在 background、runtime presenter、content 等无 React 上下文中使用。
 * - language 参数由调用方传入（通常从 chrome.storage.local 或运行时上下文读取）。
 * - 历史 message/trace 在生成时记录所用语言编码，**不强制回译**。
 *
 * @param key     翻译 key
 * @param locale  当前语言
 * @param params  插值参数（如 `{ name: 'John' }`）
 * @returns 翻译后的字符串；key 不存在时返回 key 本身作为 fallback
 */
export function t(
  key: string,
  locale: Locale,
  params?: TranslationParams
): string {
  const template = dictionaries[locale]?.[key as TranslationKey];
  if (template === undefined) {
    // Fallback to zh first, then to the key itself
    const zhTemplate = dictionaries['zh']?.[key as TranslationKey];
    if (zhTemplate !== undefined) {
      return interpolate(zhTemplate, params);
    }
    return interpolate(key, params);
  }
  return interpolate(template, params);
}

/**
 * 翻译到中文（强制 zh locale）。
 * 适用于需要固定中文输出的场景（如日志、内部 trace）。
 */
export function tZh(key: TranslationKey, params?: TranslationParams): string {
  return t(key, 'zh', params);
}

function interpolate(template: string, params: TranslationParams | undefined): string {
  if (!params) {
    return template;
  }
  let result = template;
  for (const [name, value] of Object.entries(params)) {
    result = result.replaceAll(`{${name}}`, value);
  }
  return result;
}
