import type { RuntimeToolResultSnapshot } from '../../runtime/runtime-messages';
import type { TranslationKey } from '../../i18n/types';
import { ERROR_CODES } from '../../shared/constants/error-codes';

const sensitiveKeyPattern = /api.?key|password|token|secret|otp|one.?time/i;

export function formatToolResultFlags(
  toolResult: RuntimeToolResultSnapshot | undefined
): TranslationKey[] {
  if (!toolResult) {
    return [];
  }
  const flags: TranslationKey[] = [];
  if (toolResult.requiresApproval || toolResult.code === ERROR_CODES.APPROVAL_REQUIRED) {
    flags.push('tool.flag.approvalRequired');
  }
  if (toolResult.requiresObserve) {
    flags.push('tool.flag.reobserveRequired');
  }
  if (toolResult.changedPage === false) {
    flags.push('tool.flag.pageUnchanged');
  }
  return flags;
}

export function maskSensitiveValue(value: string): string {
  if (value.length <= 8) {
    return '[MASKED]';
  }
  if (value.startsWith('sk-')) {
    return `sk-...${value.slice(-4)}`;
  }
  return `[MASKED:${value.slice(-4)}]`;
}

export function redactPreview(value: unknown): unknown {
  return redactPreviewByKey(value, '');
}

function redactPreviewByKey(value: unknown, key: string): unknown {
  if (typeof value === 'string') {
    return sensitiveKeyPattern.test(key) ? '[MASKED]' : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactPreviewByKey(item, key));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sensitiveKeyPattern.test(entryKey)
          ? '[MASKED]'
          : redactPreviewByKey(entryValue, entryKey)
      ])
    );
  }
  return value;
}

export function jsonPreview(value: unknown): string {
  return JSON.stringify(redactPreview(value), null, 2);
}
