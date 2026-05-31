import type { RunSnapshot } from '../../runtime/runtime-messages';
import type { RunRecord } from './types';
import type { AgentDecision } from '../../shared/schemas/agent-decision.schema';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';

// ── Types ──

type ToolCallDecision = Extract<AgentDecision, { type: 'tool_call' }>;

export type RuntimeFormCandidate = NonNullable<RunSnapshot['structuredPageData']>['forms']['items'][number];

export type RuntimeToolDecisionRejection = {
  code: string;
  message: string;
  kind: 'needs_explicit_form_values' | 'blocked';
  fields?: Array<{ fieldRefId: string; value: string }> | undefined;
};

// ── Normalize ──

/** Normalizes a model decision, fixing common form-fill argument issues. */
export function normalizeModelDecision(decision: AgentDecision): AgentDecision {
  if (decision.type !== 'tool_call') {
    return decision;
  }
  return normalizeFillToolDecision(decision);
}

function normalizeFillToolDecision(decision: ToolCallDecision): ToolCallDecision {
  if (decision.tool === TOOL_NAMES.FORM_FILL_FIELD) {
    const value = normalizeFillFieldValue(decision.args.value);
    if (value === undefined || value === decision.args.value) {
      return decision;
    }
    return {
      ...decision,
      args: {
        ...decision.args,
        value
      }
    };
  }

  if (decision.tool !== TOOL_NAMES.FORM_FILL_MANY || !Array.isArray(decision.args.fields)) {
    return decision;
  }

  let changed = false;
  const rawFields = decision.args.fields as unknown[];
  const fields = rawFields.map((field): unknown => {
    if (typeof field !== 'object' || field === null || Array.isArray(field)) {
      return field;
    }
    const record = field as Record<string, unknown>;
    const value = normalizeFillFieldValue(record.value);
    if (value === undefined || value === record.value) {
      return field;
    }
    changed = true;
    return {
      ...record,
      value
    };
  });

  return changed
    ? {
        ...decision,
        args: {
          ...decision.args,
          fields
        }
      }
    : decision;
}

// ── Augment ──

/** Augments a form fill decision with runtime context (e.g. checkbox opt-out). */
export function augmentRuntimeToolDecision(
  record: RunRecord,
  snapshot: RunSnapshot,
  decision: ToolCallDecision
): ToolCallDecision {
  if (decision.tool !== TOOL_NAMES.FORM_FILL_MANY) {
    return decision;
  }
  const fields = readFillFields(decision.args);
  if (!fields || !hasCheckboxOptOutIntent(record.task)) {
    return decision;
  }
  const existingRefIds = new Set(fields.map((field) => field.fieldRefId));
  const optOutFields = runtimeFormCandidates(snapshot)
    .filter((candidate) =>
      isCheckboxOptOutAllowed(record.task, candidate) &&
      isCheckboxCurrentlyChecked(candidate) &&
      !existingRefIds.has(candidate.refId)
    )
    .map((candidate) => ({
      fieldRefId: candidate.refId,
      value: 'false'
    }));
  if (optOutFields.length === 0 || !Array.isArray(decision.args.fields)) {
    return decision;
  }
  return {
    ...decision,
    args: {
      ...decision.args,
      fields: [
        ...fields,
        ...optOutFields
      ]
    }
  };
}

// ── Read / parse ──

export function isFormFillTool(tool: string): boolean {
  return tool === TOOL_NAMES.FORM_FILL_MANY || tool === TOOL_NAMES.FORM_FILL_FIELD;
}

export function readFillFields(args: Record<string, unknown>): Array<{ fieldRefId: string; value: string; clear?: boolean | undefined }> | undefined {
  const fields = args.fields;
  if (!Array.isArray(fields)) {
    return undefined;
  }
  const result: Array<{ fieldRefId: string; value: string; clear?: boolean | undefined }> = [];
  for (const item of fields) {
    const value = typeof item === 'object' && item !== null
      ? normalizeFillFieldValue((item as { value?: unknown }).value)
      : undefined;
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as { fieldRefId?: unknown }).fieldRefId !== 'string' ||
      value === undefined
    ) {
      return undefined;
    }
    result.push({
      fieldRefId: (item as { fieldRefId: string }).fieldRefId,
      value,
      ...(
        typeof (item as { clear?: unknown }).clear === 'boolean'
          ? { clear: (item as { clear: boolean }).clear }
          : {}
      )
    });
  }
  return result;
}

function normalizeFillFieldValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return undefined;
}

// ── Form candidates ──

export function runtimeFormCandidates(snapshot: RunSnapshot): RuntimeFormCandidate[] {
  const forms = snapshot.structuredPageData?.forms.items ?? [];
  const seen = new Set(forms.map((field) => field.refId));
  const checkboxRefs = (snapshot.structuredPageData?.interactive.items ?? [])
    .filter((item) =>
      !seen.has(item.refId) &&
      item.visible &&
      !item.disabled &&
      (item.role === 'checkbox' || item.tagName.toLowerCase() === 'input') &&
      isOptOutCheckboxText(item.name ?? '')
    )
    .map((item): RuntimeFormCandidate => ({
      refId: item.refId,
      label: item.name,
      name: item.name,
      type: 'checkbox',
      required: false,
      disabled: item.disabled,
      sensitive: false,
      valuePreview: item.checked ? 'checked' : 'unchecked',
      validation: {
        valid: true
      },
      writable: {
        visible: item.visible,
        readonly: false,
        hidden: false,
        isFileUpload: false,
        isContentEditable: false,
        honeypotCandidate: false,
        actualTagName: item.tagName,
        actualValue: item.checked ? 'true' : 'false',
        checked: item.checked
      },
      warnings: item.warnings
    }));
  return [...forms, ...checkboxRefs];
}

// ── Value matching ──

export function isExplicitTaskSubstring(task: string, value: string): boolean {
  const normalizedTask = normalizeUserText(task);
  const normalizedValue = normalizeUserText(value);
  return normalizedValue.length > 0 && normalizedTask.includes(normalizedValue);
}

export function isExplicitAllowedFieldValue(
  task: string,
  value: string,
  candidate: RuntimeFormCandidate
): boolean {
  if (isExplicitTaskSubstring(task, value)) {
    return true;
  }
  if (isCheckboxOptOutValue(value) && isCheckboxOptOutAllowed(task, candidate)) {
    return true;
  }
  if (!isSelectLikeField(candidate)) {
    return false;
  }
  return selectOptionMentionsForValue(candidate, value).some((mention) =>
    isExplicitTaskSubstring(task, mention)
  );
}

export function isExistingValueBlocked(
  candidate: RuntimeFormCandidate,
  desiredValue: string
): boolean {
  if (!candidate.valuePreview || candidate.valuePreview === 'empty' || candidate.valuePreview === 'unchecked') {
    return false;
  }
  if (isCheckboxField(candidate) && isCheckboxOptOutValue(desiredValue)) {
    return false;
  }
  if (!isSelectLikeField(candidate)) {
    return true;
  }
  const actualValue = candidate.writable?.actualValue;
  if (actualValue && normalizeUserText(actualValue) === normalizeUserText(desiredValue)) {
    return true;
  }
  return false;
}

// ── Checkbox helpers ──

export function isCheckboxField(candidate: RuntimeFormCandidate): boolean {
  return candidate.type === 'checkbox';
}

export function isCheckboxOptOutValue(value: string): boolean {
  const normalized = normalizeUserText(value);
  return normalized === 'false' ||
    normalized === 'unchecked' ||
    normalized === 'off' ||
    normalized === 'no';
}

export function isCheckboxOptOutAllowed(
  task: string,
  candidate: RuntimeFormCandidate
): boolean {
  if (!isCheckboxField(candidate) || !hasCheckboxOptOutIntent(task)) {
    return false;
  }
  const fieldText = [
    candidate.label,
    candidate.name
  ].filter(Boolean).join(' ');
  return isOptOutCheckboxText(`${fieldText} ${task}`);
}

export function isCheckboxCurrentlyChecked(candidate: RuntimeFormCandidate): boolean {
  return candidate.valuePreview === 'checked' ||
    candidate.valuePreview === 'non-empty' ||
    candidate.writable?.checked === true ||
    candidate.writable?.actualValue === 'true';
}

export function hasCheckboxOptOutIntent(task: string): boolean {
  return /(?:不要勾选|不勾选|别勾选|取消勾选|取消选中|不订阅|取消订阅|不接收|拒绝接收|do not (?:check|select|subscribe|receive)|don't (?:check|select|subscribe|receive)|opt out|unsubscribe|no marketing)/iu.test(task);
}

export function isOptOutCheckboxText(value: string): boolean {
  return /(?:营销|推荐|通知|电子邮件|交流信息|订阅|更新|newsletter|marketing|updates|recommendation|offers|email)/iu.test(value);
}

// ── Select helpers ──

export function isSelectLikeField(candidate: RuntimeFormCandidate): boolean {
  return candidate.type === 'select' ||
    candidate.type === 'select-one' ||
    candidate.type === 'select-multiple' ||
    candidate.writable?.actualTagName === 'select';
}

export function selectOptionMentionsForValue(
  candidate: RuntimeFormCandidate,
  value: string
): string[] {
  const normalizedValue = normalizeUserText(value);
  const mentions = new Set<string>();
  for (const option of candidate.writable?.options ?? []) {
    const optionValue = normalizeUserText(option.value);
    const optionLabel = normalizeUserText(option.label);
    if (optionValue === normalizedValue || optionLabel === normalizedValue) {
      mentions.add(option.value);
      mentions.add(option.label);
      for (const alias of countryAliases(option.value, option.label)) {
        mentions.add(alias);
      }
    }
  }
  return [...mentions].filter(Boolean);
}

function countryAliases(value: string, label: string): string[] {
  const normalized = normalizeUserText(`${value} ${label}`);
  if (/\b(usa|us|united states|united states of america)\b/u.test(normalized) || normalized.includes('美国')) {
    return ['USA', 'US', 'United States', 'United States of America', '美国'];
  }
  return [];
}

// ── Runtime validation ──

export function validateRuntimeToolDecision(
  record: RunRecord,
  snapshot: RunSnapshot,
  decision: AgentDecision
): RuntimeToolDecisionRejection | undefined {
  if (decision.type !== 'tool_call') {
    return undefined;
  }
  if (decision.tool !== TOOL_NAMES.FORM_FILL_MANY && decision.tool !== TOOL_NAMES.FORM_FILL_FIELD) {
    return undefined;
  }

  // Normalize both FORM_FILL_FIELD and FORM_FILL_MANY into a common field list
  let fields: Array<{ fieldRefId: string; value: string }>;
  if (decision.tool === TOOL_NAMES.FORM_FILL_FIELD) {
    const fieldRefId = decision.args.fieldRefId;
    const value = decision.args.value;
    if (typeof fieldRefId !== 'string' || typeof value !== 'string') {
      return {
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        message: 'Form fill arguments are invalid',
        kind: 'blocked'
      };
    }
    fields = [{ fieldRefId, value }];
  } else {
    const rawFields = readFillFields(decision.args);
    if (!rawFields) {
      return {
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        message: 'Form fill arguments are invalid',
        kind: 'blocked'
      };
    }
    fields = rawFields;
  }

  const writableFields = new Map(
    runtimeFormCandidates(snapshot).map((field) => [field.refId, field])
  );
  for (const field of fields) {
    const candidate = writableFields.get(field.fieldRefId);
    if (!candidate) {
      return {
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        message: `Form fill rejected: field ${field.fieldRefId} is not in the current observation`,
        kind: 'blocked'
      };
    }
    if (!isExplicitAllowedFieldValue(record.task, field.value, candidate)) {
      return {
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        message: 'Form fill rejected: every value must be an explicit value from the user task',
        kind: 'needs_explicit_form_values',
        fields
      };
    }
    if (candidate.sensitive) {
      return {
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        message: `Form fill rejected: field ${field.fieldRefId} is sensitive`,
        kind: 'blocked'
      };
    }
    if (candidate.disabled) {
      return {
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        message: `Form fill rejected: field ${field.fieldRefId} is disabled`,
        kind: 'blocked'
      };
    }
    if (candidate.writable?.readonly) {
      return {
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        message: `Form fill rejected: field ${field.fieldRefId} is read-only`,
        kind: 'blocked'
      };
    }
    if (candidate.type === 'hidden' || candidate.type === 'file') {
      return {
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        message: `Form fill rejected: field ${field.fieldRefId} is not safe to fill`,
        kind: 'blocked'
      };
    }
    if (isExistingValueBlocked(candidate, field.value)) {
      return {
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        message: `Form fill rejected: field ${field.fieldRefId} already has a value`,
        kind: 'blocked'
      };
    }
  }
  return undefined;
}

// ── Text normalization ──

export function normalizeUserText(value: string): string {
  return value
    .replace(/[""'"'‘’]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}
