import { type Locale, SUPPORTED_LOCALES } from './types';

type AppSettingsRecord = Record<string, unknown>;

/**
 * 从浏览器 / 系统偏好推断默认 locale。
 *
 * 优先级：
 *   'zh'
 */
function resolveMachineLocale(): Locale {
  return 'zh';
}

/**
 * 从 chrome.storage.local 读取已保存的 locale。
 * 未保存时调用 resolveMachineLocale() 自动选择。
 */
export async function readLocale(): Promise<Locale> {
  if (!globalThis.chrome?.storage?.local) {
    return resolveMachineLocale();
  }
  try {
    const result = await chrome.storage.local.get('appSettings');
    const appSettings = result?.appSettings as AppSettingsRecord | undefined;
    const stored = appSettings?.locale;
    if (SUPPORTED_LOCALES.includes(stored as Locale)) {
      return stored as Locale;
    }
  } catch {
    // 读取失败时回退
  }
  return resolveMachineLocale();
}

/**
 * 将 locale 写入 chrome.storage.local 的 appSettings 中。
 */
export async function writeLocale(locale: Locale): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return;
  const result = await chrome.storage.local.get('appSettings');
  const existing = (result?.appSettings as AppSettingsRecord | undefined) ?? {};
  const appSettings: AppSettingsRecord = { ...existing, locale };
  await chrome.storage.local.set({ appSettings });
}

/**
 * 将原始 locale string 规范化为 Locale 类型。
 * 无法识别时返回 zh 作为 fallback。
 */
export function normalizeLocale(input: string | undefined | null): Locale {
  if (!input) return 'zh';
  const lower = input.trim().toLowerCase();
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('zh')) return 'zh';
  return 'zh';
}
