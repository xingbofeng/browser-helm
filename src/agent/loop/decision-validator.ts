import type { AgentDecision } from '../../shared/schemas/agent-decision.schema';
import type { ModelMessage } from '../../shared/schemas/model-message.schema';
import type { RunSnapshot } from '../../runtime/runtime-messages';
import type { RunRecord } from './types';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { redactTextForModelContext } from '../../shared/redaction';
import type { ToolPromptContract } from '../../tools/core/tool-router';
import { buildRecentToolActions } from './recent-tool-actions';
import {
  isFormFillTool,
  readFillFields,
  runtimeFormCandidates,
  isExplicitAllowedFieldValue,
  isExistingValueBlocked
} from './form-fill-augmenter';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';

// ── Types ──

type ToolCallDecision = Extract<AgentDecision, { type: 'tool_call' }>;

export type ModelDecisionKind =
  | 'existing_value_overwrite'
  | 'repeated_action_readiness'
  | 'tool_not_found'
  | 'repeated_form_fill'
  | 'repeated_form_verify'
  | 'repeated_form_inspect'
  | 'repeated_page_read'
  | 'forbidden_tool'
  | 'ask_user_prohibited'
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
  if (decision.type === 'finish') {
    return undefined;
  }
  if (decision.type === 'ask_user') {
    return askUserDecisionError(record);
  }
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
  const forbiddenTool = forbiddenToolDecisionError(decision, record);
  if (forbiddenTool) {
    return forbiddenTool;
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
  if (lastRepairError.kind === 'repeated_action_readiness') {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: [
        lastRepairError.message,
        'Repeated action readiness repair must return finish, ask_user, or fail.',
        `Do not call tools such as ${decision.tool} during this repair.`
      ].join(' '),
      kind: 'repeated_action_readiness',
      detail: lastRepairError.detail
    };
  }
  if (lastRepairError.kind === 'repeated_page_read') {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: [
        lastRepairError.message,
        'Repeated page read repair must return finish, ask_user, or fail.',
        `Do not call tools such as ${decision.tool} during this repair.`
      ].join(' '),
      kind: 'repeated_page_read',
      detail: lastRepairError.detail
    };
  }
  if (lastRepairError.kind === 'forbidden_tool') {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: [
        lastRepairError.message,
        'Forbidden-tool repair must return finish, ask_user, or fail.',
        `Do not call tools such as ${decision.tool} during this repair.`
      ].join(' '),
      kind: 'forbidden_tool',
      detail: lastRepairError.detail
    };
  }
  if (lastRepairError.kind === 'ask_user_prohibited') {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: [
        lastRepairError.message,
        'Ask-user repair must return finish or fail.',
        `Do not call tools such as ${decision.tool} during this repair.`
      ].join(' '),
      kind: 'ask_user_prohibited',
      detail: lastRepairError.detail
    };
  }
  if (lastRepairError.kind === 'repeated_form_inspect' && isFieldDiscoveryTool(decision.tool)) {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: [
        lastRepairError.message,
        'Repeated form inspection repair must not call another form or accessibility discovery tool.',
        `Do not call tools such as ${decision.tool} during this repair.`
      ].join(' '),
      kind: 'repeated_form_inspect',
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

function askUserDecisionError(record: RunRecord): ModelDecisionError | undefined {
  if (!taskProhibitsAskUser(record.task)) {
    return undefined;
  }
  return {
    code: ERROR_CODES.TOOL_ARGS_INVALID,
    message: [
      'The user task explicitly requires a direct finish and does not allow asking for more input.',
      'Use the evidence already collected to return finish, or fail if the task cannot be completed.'
    ].join(' '),
    kind: 'ask_user_prohibited',
    detail: {
      task: redactTextForModelContext(record.task)
    }
  };
}

function forbiddenToolDecisionError(
  decision: ToolCallDecision,
  record: RunRecord
): ModelDecisionError | undefined {
  if (!taskExplicitlyForbidsTool(record.task, decision.tool)) {
    return undefined;
  }
  return {
    code: ERROR_CODES.TOOL_ARGS_INVALID,
    message: [
      `The user explicitly prohibited ${decision.tool}.`,
      'Do not execute a tool that the task says not to call.',
      'Use existing evidence to return finish, ask_user, or fail.'
    ].join(' '),
    kind: 'forbidden_tool',
    detail: {
      tool: decision.tool,
      task: redactTextForModelContext(record.task)
    }
  };
}

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
  const repeatedActionReadiness = repeatedActionReadinessDecisionError(decision, record);
  if (repeatedActionReadiness) {
    return repeatedActionReadiness;
  }
  if (snapshot.toolResult?.ok !== true) {
    return repeatedTraceToolDecisionError(decision, record);
  }
  if (isFieldDiscoveryTool(decision.tool) && hasPriorSuccessfulFormInspection(record)) {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: [
        'The form fields were already discovered successfully on the unchanged page.',
        'Do not keep calling form or accessibility discovery tools.',
        'If the user supplied explicit fill values and a writable field is available, call a form fill tool now; otherwise return finish, ask_user, or fail.'
      ].join(' '),
      kind: 'repeated_form_inspect',
      detail: {
        kind: 'repeated_form_inspect',
        nextTool: decision.tool,
        fields: compactKnownFormFields(snapshot)
      }
    };
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
  if (
    (isFormInspectionTool(lastTool) && isFieldDiscoveryTool(decision.tool)) ||
    repeatsFormInspection(lastTool, decision.tool)
  ) {
    return {
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      message: [
        'The form structure was already inspected successfully on the unchanged page.',
        'Do not repeat form list/read/inspect planning calls.',
        'If the user supplied explicit fill values and a writable field is available, call a form fill tool now; otherwise return finish, ask_user, or fail.'
      ].join(' '),
      kind: 'repeated_form_inspect',
      detail: {
        kind: 'repeated_form_inspect',
        lastTool,
        nextTool: decision.tool,
        fields: compactKnownFormFields(snapshot)
      }
    };
  }
  if (isPageContentReadTool(lastTool) && isPageContentReadTool(decision.tool)) {
    const nextCursor = pageReadNextCursor(snapshot.toolResult);
    if (
      !(
        snapshot.toolResult.detail &&
        pageReadHasMore(snapshot.toolResult) &&
        typeof nextCursor === 'number' &&
        numberField(decision.args, 'cursor') === nextCursor
      )
    ) {
      return {
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        message: [
          'The current page content was already read successfully on the unchanged page.',
          'Do not repeat the page read. Use the available text and return finish, ask_user, or fail.',
          'Only continue reading when the previous result has hasMore=true and you pass its exact nextCursor.'
        ].join(' '),
        kind: 'repeated_page_read',
        detail: {
          kind: 'repeated_page_read',
          lastTool,
          nextCursor
        }
      };
    }
  }
  return repeatedTraceToolDecisionError(decision, record);
}

function repeatedActionReadinessDecisionError(
  decision: ToolCallDecision,
  record: RunRecord
): ModelDecisionError | undefined {
  if (decision.tool !== TOOL_NAMES.ACTION_CHECK_READINESS) {
    return undefined;
  }
  const intent = actionReadinessIntentFromArgs(decision.args);
  if (!intent || !hasPriorSuccessfulActionReadiness(record, intent)) {
    return undefined;
  }
  return {
    code: ERROR_CODES.TOOL_ARGS_INVALID,
    message: [
      `Action readiness for ${intent.kind} ${intent.refId} already succeeded on the unchanged page.`,
      'bh_action_check_readiness is read-only and does not execute the action.',
      'Do not repeat readiness for the same target; return finish with the readiness result, ask_user if user input is needed, or fail if the requested action cannot be completed with available tools.'
    ].join(' '),
    kind: 'repeated_action_readiness',
    detail: {
      kind: 'repeated_action_readiness',
      actionKind: intent.kind,
      refId: intent.refId
    }
  };
}

function hasPriorSuccessfulActionReadiness(
  record: RunRecord,
  intent: { kind: string; refId: string }
): boolean {
  let pendingArgs: unknown;
  let sawMatchingReadiness = false;
  for (const event of record.trace ?? []) {
    const payload = eventPayload(event);
    if (event.type === TRACE_EVENT_NAMES.TOOL_STARTED) {
      pendingArgs = stringField(payload, 'tool') === TOOL_NAMES.ACTION_CHECK_READINESS
        ? payload.args
        : undefined;
      continue;
    }
    if (event.type !== TRACE_EVENT_NAMES.TOOL_RESULT) {
      continue;
    }
    const tool = stringField(payload, 'tool');
    if (
      payload.changedPage === true ||
      tool === TOOL_NAMES.PAGE_OBSERVE ||
      tool === TOOL_NAMES.A11Y_REFRESH_REFS
    ) {
      sawMatchingReadiness = false;
      pendingArgs = undefined;
      continue;
    }
    if (
      tool === TOOL_NAMES.ACTION_CHECK_READINESS &&
      payload.ok === true &&
      sameActionReadinessIntent(actionReadinessIntentFromArgs(pendingArgs), intent)
    ) {
      sawMatchingReadiness = true;
    }
    pendingArgs = undefined;
  }
  return sawMatchingReadiness;
}

function hasPriorSuccessfulFormInspection(record: RunRecord): boolean {
  let sawInspection = false;
  for (const event of record.trace ?? []) {
    const payload = eventPayload(event);
    if (event.type !== TRACE_EVENT_NAMES.TOOL_RESULT) {
      continue;
    }
    const tool = stringField(payload, 'tool');
    if (
      payload.changedPage === true ||
      tool === TOOL_NAMES.PAGE_OBSERVE ||
      tool === TOOL_NAMES.A11Y_REFRESH_REFS
    ) {
      sawInspection = false;
      continue;
    }
    if (payload.ok === true && tool && isFormInspectionTool(tool)) {
      sawInspection = true;
    }
  }
  return sawInspection;
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
  return t('runtime.formFill.existingValue.message', locale);
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

function compactKnownFormFields(snapshot: RunSnapshot): Array<Record<string, string | boolean | undefined>> {
  return (snapshot.structuredPageData?.forms.items ?? [])
    .slice(0, 30)
    .map((field) => ({
      refId: field.refId,
      label: field.label,
      name: field.name,
      type: field.type,
      valuePreview: field.valuePreview,
      actualValue: field.sensitive ? undefined : field.writable?.actualValue,
      checked: field.writable?.checked
    }));
}

function actionReadinessIntentFromArgs(args: unknown): { kind: string; refId: string } | undefined {
  if (!isRecord(args)) {
    return undefined;
  }
  const kind = stringField(args, 'kind');
  const refId = stringField(args, 'refId');
  return kind && refId ? { kind, refId } : undefined;
}

function sameActionReadinessIntent(
  left: { kind: string; refId: string } | undefined,
  right: { kind: string; refId: string }
): boolean {
  return Boolean(left && left.kind === right.kind && left.refId === right.refId);
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function taskExplicitlyForbidsTool(task: string, tool: string): boolean {
  return task
    .split(/[。！？!?；;，,\n]/u)
    .some((sentence) =>
      sentence.includes(tool) &&
      !/(?:再次|重复|继续|another|again|repeat)/iu.test(sentence) &&
      /(?:禁止|不要|不得|不能|避免)(?:调用|使用)?|(?:do\s+not|don't|never|not\s+call)\s+(?:call\s+|use\s+)?/iu.test(sentence)
    );
}

function taskProhibitsAskUser(task: string): boolean {
  return /(?:必须|直接)\s*finish|finish\s*(?:直接|即可)|不要\s*ask_user|不要\s*询问|不要\s*追问|do\s+not\s+ask|don't\s+ask/iu.test(task);
}

// ── Repair messages ──

export function buildRepairMessages(
  messages: ModelMessage[],
  error: ModelDecisionError,
  _toolsContracts: ToolPromptContract[]
): ModelMessage[] {
  // Repair prompt must NOT:
  //   - list available tools (already in the stable system prefix)
  //   - suggest specific tool names (model might latch onto them)
  //   - relax mode, risk, permission, or approval constraints
  //   - include raw model output (potentially sensitive)
  if (error.kind === 'existing_value_overwrite') {
    return [
      ...messages,
      {
        role: 'user' as const,
        content: [
          '═══ REPAIR (1 of 1) ═══',
          `Error: ${error.message}`,
          'You must NOT call any tool for this repair.',
          'Return finish (if page already satisfies user request) or ask_user (if you need confirmation).',
          'System policy, tool list, approval rules, and output schema are unchanged.',
          'Return one JSON AgentDecision only — no markdown, no explanation.'
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
          '═══ REPAIR (1 of 1) ═══',
          `Error: ${error.message}`,
          `Already-filled refs: ${fieldRefIds.join(', ') || '(unknown)'}`,
          'Do not repeat the fill. Return finish (if user did not ask to submit) or call bh_form_verify only.',
          'System policy, tool list, approval rules, and output schema are unchanged.',
          'Return one JSON AgentDecision only — no markdown, no explanation.'
        ].join('\n')
      }
    ];
  }
  if (error.kind === 'repeated_action_readiness') {
    return [
      ...messages,
      {
        role: 'user' as const,
        content: [
          '═══ REPAIR (1 of 1) ═══',
          `Error: ${error.message}`,
          'The readiness check already ran for this unchanged target.',
          'You must NOT call any tool for this repair.',
          'Return finish with the readiness result and action boundary, ask_user only for missing user input, or fail if the request cannot be completed with available tools.',
          'System policy, tool list, approval rules, and output schema are unchanged.',
          'Return one JSON AgentDecision only — no markdown, no explanation.'
        ].join('\n')
      }
    ];
  }
  if (error.kind === 'repeated_page_read') {
    return [
      ...messages,
      {
        role: 'user' as const,
        content: [
          '═══ REPAIR (1 of 1) ═══',
          `Error: ${error.message}`,
          'The page content has already been read for this unchanged page.',
          'You must NOT call any page read tool for this repair.',
          'Return finish with the answer using lastToolResult / priorityPageReadText, ask_user only for missing user input, or fail if the task cannot be answered.',
          'System policy, tool list, approval rules, and output schema are unchanged.',
          'Return one JSON AgentDecision only — no markdown, no explanation.'
        ].join('\n')
      }
    ];
  }
  if (error.kind === 'repeated_form_inspect') {
    const fields = isRecord(error.detail) && Array.isArray(error.detail.fields)
      ? JSON.stringify(error.detail.fields)
      : '[]';
    return [
      ...messages,
      {
        role: 'user' as const,
        content: [
          '═══ REPAIR (1 of 1) ═══',
          `Error: ${error.message}`,
          'The form fields are already known for this unchanged page.',
          `Known fields: ${fields}`,
          'Do not call bh_form_list, bh_form_read_fields, bh_form_inspect, bh_form_infer_fill_plan, bh_a11y_snapshot, or bh_a11y_find_interactive again.',
          'If the user provided an explicit value and there is a writable target field, call bh_form_fill_field or bh_form_fill_many now.',
          'Otherwise return finish, ask_user, or fail.',
          'System policy, tool list, approval rules, and output schema are unchanged.',
          'Return one JSON AgentDecision only — no markdown, no explanation.'
        ].join('\n')
      }
    ];
  }
  if (error.kind === 'forbidden_tool') {
    return [
      ...messages,
      {
        role: 'user' as const,
        content: [
          '═══ REPAIR (1 of 1) ═══',
          `Error: ${error.message}`,
          'The selected tool is explicitly prohibited by the user task.',
          'You must NOT call any tool for this repair.',
          'Return finish using already collected evidence, ask_user if the task cannot be completed safely, or fail if required evidence is unavailable.',
          'System policy, tool list, approval rules, and output schema are unchanged.',
          'Return one JSON AgentDecision only — no markdown, no explanation.'
        ].join('\n')
      }
    ];
  }
  if (error.kind === 'ask_user_prohibited') {
    return [
      ...messages,
      {
        role: 'user' as const,
        content: [
          '═══ REPAIR (1 of 1) ═══',
          `Error: ${error.message}`,
          'The task requires a direct final answer instead of asking the user.',
          'Use already collected tool results and return finish now, or return fail if completion is impossible.',
          'Do not call another tool for this repair.',
          'System policy, tool list, approval rules, and output schema are unchanged.',
          'Return one JSON AgentDecision only — no markdown, no explanation.'
        ].join('\n')
      }
    ];
  }
  // parse_failure, tool_not_found, and other errors
  return [
    ...messages,
    {
      role: 'user' as const,
      content: [
        '═══ REPAIR (1 of 1) ═══',
        `Error: ${error.message}`,
        'Return exactly one valid JSON AgentDecision. No markdown, no explanation.',
        'Valid types: tool_call, finish, ask_user, fail.',
        'You may only call tools listed in the system prompt availableTools.',
        'System policy, tool list, approval rules, and output schema are unchanged.',
        'Return one JSON AgentDecision only — no markdown, no explanation.'
      ].join('\n')
    }
  ];
}

// ── Utility ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPageContentReadTool(tool: string): boolean {
  return tool === TOOL_NAMES.PAGE_READ_ARTICLE ||
    tool === TOOL_NAMES.PAGE_READ_VISIBLE_TEXT ||
    tool === TOOL_NAMES.DOC_READ_URL;
}

function repeatsFormInspection(lastTool: string, nextTool: string): boolean {
  if (lastTool === TOOL_NAMES.FORM_LIST) {
    return nextTool === TOOL_NAMES.FORM_LIST || nextTool === TOOL_NAMES.FORM_INSPECT;
  }
  if (lastTool === TOOL_NAMES.FORM_READ_FIELDS || lastTool === TOOL_NAMES.FORM_INSPECT) {
    return isFormInspectionTool(nextTool);
  }
  if (lastTool === TOOL_NAMES.FORM_INFER_FILL_PLAN) {
    return isFormInspectionTool(nextTool) || nextTool === TOOL_NAMES.FORM_INFER_FILL_PLAN;
  }
  return false;
}

function isFormInspectionTool(tool: string): boolean {
  return tool === TOOL_NAMES.FORM_LIST ||
    tool === TOOL_NAMES.FORM_READ_FIELDS ||
    tool === TOOL_NAMES.FORM_INSPECT ||
    tool === TOOL_NAMES.FORM_INFER_FILL_PLAN;
}

function isFieldDiscoveryTool(tool: string): boolean {
  return isFormInspectionTool(tool) ||
    tool === TOOL_NAMES.A11Y_SNAPSHOT ||
    tool === TOOL_NAMES.A11Y_FIND_INTERACTIVE;
}

function pageReadHasMore(result: NonNullable<RunSnapshot['toolResult']>): boolean {
  const data = toolResultData(result);
  return data?.hasMore === true;
}

function pageReadNextCursor(result: NonNullable<RunSnapshot['toolResult']>): number | undefined {
  const data = toolResultData(result);
  return data ? numberField(data, 'nextCursor') : undefined;
}

function toolResultData(result: NonNullable<RunSnapshot['toolResult']>): Record<string, unknown> | undefined {
  const detail = result.detail;
  if (!isRecord(detail) || !isRecord(detail.data)) {
    return undefined;
  }
  return detail.data;
}

function eventPayload(event: RunRecord['trace'][number]): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
