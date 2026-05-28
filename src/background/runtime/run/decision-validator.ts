import type { AgentDecision } from '../../../shared/schemas/agent-decision.schema';
import type { ModelMessage } from '../../../shared/schemas/model-message.schema';
import type { RunSnapshot } from '../../../runtime/runtime-messages';
import type { RunRecord } from './runtime-service-types';
import { ERROR_CODES } from '../../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../../shared/constants/tool-names';
import { redactTextForModelContext } from '../../../shared/redaction';
import type { ToolPromptContract } from './runtime-service-types';
import { buildRecentToolActions } from './recent-tool-actions';
import {
  isFormFillTool,
  readFillFields,
  runtimeFormCandidates,
  isExplicitAllowedFieldValue,
  isExistingValueBlocked
} from './form-fill-augmenter';
import type { Locale } from '../../../i18n/types';

// ── Types ──

type ToolCallDecision = Extract<AgentDecision, { type: 'tool_call' }>;

export type ModelDecisionKind =
  | 'existing_value_overwrite'
  | 'tool_not_found'
  | 'repeated_form_fill'
  | 'repeated_form_verify'
  | 'parse_failure';

export type ModelDecisionError = {
  code: string;
  message: string;
  kind: ModelDecisionKind;
  detail?: unknown;
};

// ── Validation ──

export function validateModelDecision(
  decision: AgentDecision,
  toolsContracts: ToolPromptContract[],
  snapshot: RunSnapshot,
  record: RunRecord
): ModelDecisionError | undefined {
  if (decision.type !== 'tool_call') {
    return undefined;
  }
  const availableToolNames = new Set(toolsContracts.map((tool) => tool.name));
  if (!availableToolNames.has(decision.tool)) {
    return {
      code: ERROR_CODES.TOOL_NOT_FOUND,
      message: `Model selected unavailable tool: ${decision.tool}`,
      kind: 'tool_not_found',
      detail: {
        tool: decision.tool,
        availableTools: [...availableToolNames]
      }
    };
  }
  return existingValueDecisionError(decision, snapshot, record) ??
    repeatedToolDecisionError(decision, snapshot, record);
}

export function validateRepairDecision(
  decision: AgentDecision,
  lastRepairError: ModelDecisionError | undefined
): ModelDecisionError | undefined {
  if (!lastRepairError || decision.type !== 'tool_call') {
    return undefined;
  }
  if (lastRepairError.kind === 'repeated_form_fill') {
    if (decision.tool === TOOL_NAMES.FORM_VERIFY) {
      return undefined;
    }
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: [
        lastRepairError.message,
        'Repeated form fill repair must return finish, or call bh_form_verify for the already-filled field refs.',
        `Do not call tools such as ${decision.tool} during this repair.`
      ].join(' '),
      kind: 'repeated_form_fill',
      detail: lastRepairError.detail
    };
  }
  if (lastRepairError.kind !== 'existing_value_overwrite') {
    return undefined;
  }
  return {
    code: ERROR_CODES.TOOL_ARGS_INVALID,
    message: [
      lastRepairError.message,
      'Existing-value overwrite repair must return finish or ask_user.',
      `Do not call tools such as ${decision.tool} during this repair.`
    ].join(' '),
    kind: 'existing_value_overwrite',
    detail: lastRepairError.detail
  };
}

// ── Error checks ──

function existingValueDecisionError(
  decision: AgentDecision,
  snapshot: RunSnapshot,
  record: RunRecord
): ModelDecisionError | undefined {
  if (decision.type !== 'tool_call' || !isFormFillTool(decision.tool)) {
    return undefined;
  }
  const fields = readDecisionFillFields(decision);
  if (!fields?.length) {
    return undefined;
  }
  const candidates = new Map(runtimeFormCandidates(snapshot).map((field) => [field.refId, field]));
  if (fields.some((field) => {
    const candidate = candidates.get(field.fieldRefId);
    return candidate ? !isExplicitAllowedFieldValue(record.task, field.value, candidate) : false;
  })) {
    return undefined;
  }
  const blocked = fields.find((field) => {
    const candidate = candidates.get(field.fieldRefId);
    return candidate ? isExistingValueBlocked(candidate, field.value) : false;
  });
  if (!blocked) {
    return undefined;
  }
  return {
    code: ERROR_CODES.TOOL_ARGS_INVALID,
    message: [
      `Field ${blocked.fieldRefId} already has a value.`,
      'Do not call bh_form_fill_many or bh_form_fill_field to overwrite an existing field value.',
      'Return finish if the current page already satisfies the user request, or ask_user if you need confirmation before replacing the existing value.'
    ].join(' '),
    kind: 'existing_value_overwrite',
    detail: {
      fieldRefId: blocked.fieldRefId,
      task: redactTextForModelContext(record.task)
    }
  };
}

export function repeatedToolDecisionError(
  decision: AgentDecision,
  snapshot: RunSnapshot,
  record: RunRecord
): ModelDecisionError | undefined {
  if (decision.type !== 'tool_call') {
    return undefined;
  }
  if (snapshot.toolResult?.ok !== true) {
    return repeatedTraceToolDecisionError(decision, record);
  }
  const lastTool = snapshot.toolResult.tool;
  if (
    isFormFillTool(lastTool) &&
    isFormFillTool(decision.tool)
  ) {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: 'The previous form fill already succeeded. Do not call bh_form_fill_many again for the same already-filled value; call bh_form_verify or return finish.',
      kind: 'repeated_form_fill',
      detail: {
        kind: 'repeated_form_fill',
        fieldRefIds: readDecisionFieldRefIds(decision)
      }
    };
  }
  if (lastTool === TOOL_NAMES.FORM_VERIFY && decision.tool === TOOL_NAMES.FORM_VERIFY) {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: 'The previous form verification already succeeded. Do not call bh_form_verify again; return finish or request submit approval if the user asked to submit.',
      kind: 'repeated_form_verify'
    };
  }
  return repeatedTraceToolDecisionError(decision, record);
}

function repeatedTraceToolDecisionError(
  decision: ToolCallDecision,
  record: RunRecord
): ModelDecisionError | undefined {
  const decisionFieldRefIds = readDecisionFieldRefIds(decision);
  if (!decisionFieldRefIds.length) {
    return undefined;
  }
  const matchingAction = [...buildRecentToolActions(record.trace)].reverse().find((action) =>
    action.ok &&
    action.tool === decision.tool &&
    sameStringSet(action.fieldRefIds ?? [], decisionFieldRefIds)
  );
  if (!matchingAction) {
    return undefined;
  }
  if (isFormFillTool(decision.tool)) {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: [
        'A form fill for the same field refs already succeeded earlier in this run.',
        'Do not call bh_form_fill_many again for fields that were already filled.',
        'Return finish if the user goal is satisfied, or call bh_form_verify for those field refs if explicit validation is needed.'
      ].join(' '),
      kind: 'repeated_form_fill',
      detail: {
        kind: 'repeated_form_fill',
        fieldRefIds: decisionFieldRefIds
      }
    };
  }
  if (decision.tool === TOOL_NAMES.FORM_VERIFY) {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: [
        'A form verification for the same field refs already succeeded earlier in this run.',
        'Do not call bh_form_verify again unless the page changed.',
        'Return finish, or request submit approval if the user explicitly asked to submit.'
      ].join(' '),
      kind: 'repeated_form_verify',
      detail: {
        kind: 'repeated_form_verify',
        fieldRefIds: decisionFieldRefIds
      }
    };
  }
  return undefined;
}

// ── Helpers ──

export function isExistingValueOverwriteError(error: ModelDecisionError): boolean {
  return error.kind === 'existing_value_overwrite';
}

export function existingValueFinishMessage(locale: Locale): string {
  return locale === 'en'
    ? 'The relevant field already has a value, so I did not overwrite it and did not submit the form.'
    : '相关字段已有值，我没有覆盖已有输入，也没有提交表单。';
}

function readDecisionFillFields(
  decision: ToolCallDecision
): Array<{ fieldRefId: string; value: string }> | undefined {
  if (decision.tool === TOOL_NAMES.FORM_FILL_MANY) {
    return readFillFields(decision.args);
  }
  if (decision.tool !== TOOL_NAMES.FORM_FILL_FIELD) {
    return undefined;
  }
  const fieldRefId = decision.args.fieldRefId;
  const value = decision.args.value;
  if (typeof fieldRefId !== 'string' || typeof value !== 'string') {
    return undefined;
  }
  return [{ fieldRefId, value }];
}

function readDecisionFieldRefIds(decision: ToolCallDecision): string[] {
  if (decision.tool === TOOL_NAMES.FORM_VERIFY && Array.isArray(decision.args.fieldRefIds)) {
    return decision.args.fieldRefIds.filter((value): value is string =>
      typeof value === 'string' && value.trim().length > 0
    );
  }
  return readDecisionFillFields(decision)?.map((field) => field.fieldRefId) ?? [];
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

// ── Repair messages ──

export function buildRepairMessages(
  messages: ModelMessage[],
  error: ModelDecisionError,
  toolsContracts: ToolPromptContract[]
): ModelMessage[] {
  if (error.kind === 'existing_value_overwrite') {
    return [
      ...messages,
      {
        role: 'user' as const,
        content: [
          `Your last AgentDecision was invalid: ${error.message}`,
          'For this repair, do not call any tool.',
          'Return exactly one valid JSON AgentDecision object with type finish or ask_user.',
          'Use finish if the current page already satisfies the user request without overwriting existing input.',
          'Use ask_user if you need confirmation before replacing existing input.',
          'Do not call bh_form_read_fields, bh_form_fill_many, bh_form_fill_field, or any other tool.'
        ].join('\n')
      }
    ];
  }
  if (error.kind === 'repeated_form_fill') {
    const fieldRefIds = isRecord(error.detail) && Array.isArray(error.detail.fieldRefIds)
      ? error.detail.fieldRefIds.filter((value): value is string => typeof value === 'string')
      : [];
    return [
      ...messages,
      {
        role: 'user' as const,
        content: [
          `Your last AgentDecision was invalid: ${error.message}`,
          'For this repair, do not repeat the fill and do not inspect unrelated fields.',
          `Already-filled field refs: ${fieldRefIds.join(', ') || '(unknown)'}`,
          'Return exactly one valid JSON AgentDecision object.',
          'Use finish if the user only asked to fill/select/type these fields and did not ask to submit.',
          'Use bh_form_verify only if explicit validation is still needed, with args {"fieldRefIds":[...already-filled refs]}.',
          'Do not call bh_form_read_fields, bh_form_fill_many, bh_form_fill_field, or unrelated tools.'
        ].join('\n')
      }
    ];
  }
  const availableToolNames = toolsContracts.map((tool) => tool.name);
  return [
    ...messages,
    {
      role: 'user' as const,
      content: [
        `Your last AgentDecision was invalid: ${error.message}`,
        `Available tools for this run are: ${availableToolNames.join(', ')}`,
        'Return exactly one valid JSON AgentDecision object.',
        'Do not include markdown fences, explanations, or extra text.',
        'Available decision types: tool_call, finish, ask_user, fail.',
        'For ordinary form or search-box filling, use bh_form_fill_many with a fieldRefId from structuredPageData.forms.items.',
        'Do not call unavailable generic tools such as bh_click, bh_type, browser_click, or browser_type.'
      ].join('\n')
    }
  ];
}

// ── Utility ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
