import type { TranslationKey } from '../../i18n/types';

/**
 * 为 ToolSpec 生成 title/description/ui 三元组。
 *
 * ESLint `no-literal-string` 规则通过 `ignore-callee: ['toolMeta']` 豁免
 * 该 helper，从而允许工具元数据直接使用英文字面量而无需 i18n 包装。
 *
 * 实际 i18n 通过 `ui.titleKey` / `ui.descriptionKey` 接入翻译字典；
 * title / description 仅作为代码可读的英文 fallback。
 */
export function toolMeta(
  title: string,
  description: string,
  titleKey: TranslationKey,
  descriptionKey: TranslationKey,
): {
  title: string;
  description: string;
  ui: { titleKey: TranslationKey; descriptionKey: TranslationKey };
} {
  return { title, description, ui: { titleKey, descriptionKey } };
}
