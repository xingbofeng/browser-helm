import { z } from 'zod';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';

import type { FillPlan, FillTarget } from '../../shared/schemas/form-fill.schema';

export const formInferFillPlanArgsSchema = z.object({
  userTask: z.string().min(1),
  formSummary: z.string().min(1),
  formRefId: z.string().min(1).optional(),
  fields: z.array(z.object({
    refId: z.string().min(1),
    label: z.string().optional(),
    name: z.string().optional(),
    type: z.string().min(1),
    required: z.boolean().optional(),
    disabled: z.boolean().optional(),
    sensitive: z.boolean().optional(),
    valuePreview: z.string().optional(),
    placeholder: z.string().optional(),
    ariaLabel: z.string().optional(),
  })),
});

export type FormInferFillPlanArgs = z.infer<typeof formInferFillPlanArgsSchema>;

interface FieldInput {
  refId: string;
  label?: string | undefined;
  name?: string | undefined;
  type: string;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  sensitive?: boolean | undefined;
  valuePreview?: string | undefined;
  placeholder?: string | undefined;
  ariaLabel?: string | undefined;
}

export function inferLocalFillPlan(args: FormInferFillPlanArgs, locale: Locale = 'zh'): FillPlan {
  const task = args.userTask.toLowerCase();
  const targets: FillTarget[] = [];
  const skipped: FillPlan['skippedFields'] = [];
  const rawTask = args.userTask;
  const requestedFreeText = extractRequestedFreeText(rawTask);
  const preferredFreeTextRefId = requestedFreeText
    ? choosePreferredFreeTextField(args.fields, rawTask)
    : undefined;
  for (const field of args.fields) {
    if (field.disabled) {
      skipped.push({ fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, reason: t('fillPlan.skip.disabled', locale) });
      continue;
    }
    if (field.sensitive) {
      skipped.push({ fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, reason: t('fillPlan.skip.sensitive', locale) });
      continue;
    }
    if (field.type === 'file' || field.type === 'hidden') {
      skipped.push({ fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, reason: field.type === 'file' ? t('fillPlan.skip.fileUpload', locale) : t('fillPlan.skip.hidden', locale) });
      continue;
    }
    const ti = inferField(field, task, rawTask, {
      requestedFreeText,
      preferredFreeTextRefId,
      locale,
    });
    if (
      field.type !== 'checkbox' &&
      field.valuePreview &&
      field.valuePreview !== 'empty' &&
      field.valuePreview !== 'unchecked'
    ) {
      skipped.push({ fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, reason: t('fillPlan.skip.existingValue', locale) });
      targets.push(mk(field, undefined, 'empty', 'low', t('fillPlan.skip.existingValueReason', locale), t('fillPlan.skip.existingValue', locale), locale));
      continue;
    }
    if (ti.skipReason) {
      skipped.push({ fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, reason: ti.skipReason });
    }
    targets.push(ti);
  }

  return { formRefId: args.formRefId, formSummary: args.formSummary, userTask: args.userTask, fields: targets, skippedFields: skipped };
}
function mk(field: FieldInput, value: string | undefined, source: FillTarget['source'], confidence: FillTarget['confidence'], reason: string, skipReason?: string, _locale?: Locale): FillTarget {
  const locale = _locale ?? 'zh';
  return { fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, requestedValue: value, source, confidence, reason, maskedValuePreview: skipReason ? t('fillPlan.mask.skipped', locale) : value ? mask(value) : t('fillPlan.mask.cleared', locale), ...(skipReason ? { skipReason } : {}) };
}

function inferField(field: FieldInput, task: string, rawTask: string, context: {
  requestedFreeText?: string | undefined;
  preferredFreeTextRefId?: string | undefined;
  locale?: Locale;
} = {}): FillTarget {
  const combined = [field.label ?? '', field.name ?? '', field.placeholder ?? '', field.ariaLabel ?? ''].join(' ').toLowerCase();
  const locale = context.locale ?? 'zh';

  if (field.type === 'checkbox') {
    if (hasCheckboxOptOutIntent(rawTask) && isOptOutCheckboxField(combined, rawTask)) {
      return mk(field, 'false', 'label-match', 'high', t('fillPlan.confidence.labelMatch', locale, { label: field.label ?? field.name ?? '' }), undefined, locale);
    }
    const want = /(?:勾选|选中|同意|接受|订阅|全选|check|agree|accept|subscribe|select all)/i.test(task);
    return want && !hasCheckboxOptOutIntent(rawTask)
      ? mk(field, 'true', 'label-match', 'high', t('fillPlan.confidence.labelMatch', locale, { label: field.label ?? field.name ?? '' }), undefined, locale)
      : mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.userRequired', locale), t('fillPlan.confidence.userRequired', locale), locale);
  }

  if (field.type === 'radio' || field.type === 'select-one' || field.type === 'select' || field.type === 'select-multiple') {
    return mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.needsOptions', locale), t('fillPlan.confidence.needsOptions', locale), locale);
  }

  if (/date|日期|出生/.test(combined)) {
    return mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.needsDate', locale), t('fillPlan.confidence.userRequired', locale), locale);
  }

  if (/time|时间/.test(combined)) {
    return mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.needsDate', locale), t('fillPlan.confidence.userRequired', locale), locale);
  }

  if (/email|e-?mail|邮箱|邮件/.test(combined)) {
    const m = task.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return m
      ? mk(field, m[0], 'user-task', 'high', t('fillPlan.confidence.extractEmail', locale), undefined, locale)
      : mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.userRequired', locale), t('fillPlan.confidence.userRequired', locale), locale);
  }

  if (/phone|tel|mobile|电话|手机|号/.test(combined)) {
    const p = task.match(/\d[\d\s\-()]{6,}/);
    return p
      ? mk(field, p[0], 'user-task', 'high', t('fillPlan.confidence.extractPhone', locale), undefined, locale)
      : mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.userRequired', locale), t('fillPlan.confidence.userRequired', locale), locale);
  }

  if (field.type === 'number') {
    return mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.userRequired', locale), t('fillPlan.confidence.userRequired', locale), locale);
  }

  if (/url|网址|链接|website/.test(combined)) {
    return mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.userRequired', locale), t('fillPlan.confidence.userRequired', locale), locale);
  }

  if (/search|搜索|查找/.test(combined)) {
    const hasSearchIntent = /搜索|查找|检索|find|search|look up/i.test(rawTask);
    if (
      context.requestedFreeText &&
      context.preferredFreeTextRefId &&
      context.preferredFreeTextRefId !== field.refId
    ) {
      return mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.hasBetterField', locale), t('fillPlan.confidence.hasBetterFieldSkipReason', locale), locale);
    }
    if (!hasSearchIntent) {
      return mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.userRequired', locale), t('fillPlan.confidence.userRequired', locale), locale);
    }
    return mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.userRequired', locale), t('fillPlan.confidence.needsPlanner', locale), locale);
  }

  const requestedFreeText = context.requestedFreeText;
  const wantsFreeTextReply = /输入|填入|填写|键入|打上|回复|回覆|评论|留言|发送|发布|发表|回帖|type|input|enter|fill|reply|respond|comment|send|post/i.test(rawTask);
  const isFreeTextField = /text|textarea|search/.test(field.type) ||
    /ask anything|prompt|reply|respond|comment|message|tweet|post|content|正文|内容|回复|回覆|评论|留言|输入/.test(combined);
  if (requestedFreeText && wantsFreeTextReply && isFreeTextField) {
    if (context.preferredFreeTextRefId && context.preferredFreeTextRefId !== field.refId) {
      return mk(field, undefined, 'empty', 'low', t('fillPlan.confidence.hasBetterField', locale), t('fillPlan.confidence.hasBetterFieldSkipReason', locale), locale);
    }
    return mk(field, requestedFreeText, 'user-task', 'high', t('fillPlan.confidence.extractReply', locale), undefined, locale);
  }

  if (field.placeholder && field.placeholder.length > 0) {
    return mk(field, undefined, 'placeholder-match', 'low', t('fillPlan.confidence.userRequired', locale), t('fillPlan.confidence.userRequired', locale), locale);
  }

  return mk(field, '', 'empty', 'low', t('fillPlan.confidence.userRequired', locale), t('fillPlan.confidence.userRequired', locale), locale);
}

function hasCheckboxOptOutIntent(task: string): boolean {
  return /(?:不要勾选|不勾选|别勾选|取消勾选|取消选中|不订阅|取消订阅|不接收|拒绝接收|do not (?:check|select|subscribe|receive)|don't (?:check|select|subscribe|receive)|opt out|unsubscribe|no marketing)/iu.test(task);
}

function isOptOutCheckboxField(combined: string, task: string): boolean {
  const text = `${combined} ${task}`.toLowerCase();
  return /(?:营销|推荐|通知|电子邮件|交流信息|订阅|更新|newsletter|marketing|updates|recommendation|offers|email)/iu.test(text);
}

function extractRequestedFreeText(task: string): string | undefined {
  const quoted = task.match(/[“"']([^“”"']{1,500})[”"']/u);
  if (quoted?.[1]?.trim()) {
    return quoted[1].trim();
  }
  const marker = task.match(/(?:输入|填入|填写|键入|打上|回复|回覆|评论|留言|发送|发布|发表|type|input|enter|fill|reply|respond|comment|send|post)(?:一个|一下|下|为|说|内容|[:：])?\s*(.{1,500})$/iu);
  const value = marker?.[1]?.trim();
  return value || undefined;
}

function choosePreferredFreeTextField(fields: FieldInput[], task: string): string | undefined {
  const candidates = fields
    .filter((field) =>
      !field.disabled &&
      !field.sensitive &&
      field.valuePreview !== 'non-empty' &&
      field.type !== 'file' &&
      field.type !== 'hidden' &&
      isFreeTextCandidate(field)
    )
    .map((field) => ({
      field,
      score: freeTextFieldScore(field, task)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.field.refId;
}

function isFreeTextCandidate(field: FieldInput): boolean {
  const combined = [field.label ?? '', field.name ?? '', field.placeholder ?? '', field.ariaLabel ?? ''].join(' ').toLowerCase();
  return /text|textarea|search/.test(field.type) ||
    /ask anything|prompt|reply|respond|comment|message|tweet|post|content|正文|内容|回复|回覆|评论|留言|输入/.test(combined);
}

function freeTextFieldScore(field: FieldInput, task: string): number {
  const combined = [field.label ?? '', field.name ?? '', field.placeholder ?? '', field.ariaLabel ?? ''].join(' ').toLowerCase();
  let score = 1;
  if (field.type === 'textarea') score += 8;
  if (/ask anything|prompt|reply|respond|comment|message|tweet|post|content|正文|内容|回复|回覆|评论|留言/.test(combined)) score += 8;
  if (/search|搜索|查找|find/.test(combined)) score -= /搜索|查找|检索|find|search|look up/i.test(task) ? 0 : 6;
  if (/home|主页|首页/i.test(task) && /home|主页|首页/.test(combined)) score += 4;
  return score;
}

function mask(value: string): string {
  if (value.length <= 3) return '***';
  return value.slice(0, 3) + '***' + value.slice(-2);
}
