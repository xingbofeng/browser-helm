import type { AgentDecision } from '../../shared/schemas/agent-decision.schema';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { redactTextForModelContext } from '../../shared/redaction';
import type { RunSnapshot, RuntimeTaskState } from '../../runtime/runtime-messages';
import type { RunRecord } from './types';
import { isFormFillTool } from './form-fill-augmenter';

const MAX_TASK_STATE_ITEMS = 12;
const MAX_TASK_STATE_TEXT_CHARS = 160;

export function applyModelTaskStateUpdate(record: RunRecord, decision: AgentDecision): void {
  const update = decision.taskStateUpdate;
  if (!update) {
    return;
  }
  const state = ensureTaskState(record);
  if (update.goal) {
    state.goal = safeTaskStateText(update.goal);
  }
  if (update.completed) {
    state.completed = uniqueStrings([
      ...state.completed,
      ...safeTaskStateList(update.completed)
    ]).slice(-MAX_TASK_STATE_ITEMS);
  }
  if (update.remaining) {
    state.remaining = safeTaskStateList(update.remaining).slice(0, MAX_TASK_STATE_ITEMS);
  }
  if (update.recommendedNextDecision) {
    state.recommendedNextDecision = update.recommendedNextDecision;
  }
  if (update.reason) {
    state.reason = safeTaskStateText(update.reason);
  }
  state.updatedBy = mergeTaskStateSource(state.updatedBy, 'model');
  state.updatedAt = Date.now();
}

export function syncTaskStateFromToolResult(
  record: RunRecord,
  result: RunSnapshot['toolResult']
): void {
  if (!result?.ok) {
    return;
  }
  if (!isFormFillTool(result.tool) && result.tool !== TOOL_NAMES.FORM_VERIFY) {
    return;
  }
  const fieldRefIds = fieldRefIdsFromToolResult(result);
  if (!fieldRefIds.length) {
    return;
  }
  const state = ensureTaskState(record);
  if (isFormFillTool(result.tool)) {
    state.filledFieldRefs = uniqueStrings([...state.filledFieldRefs, ...fieldRefIds]);
    state.runtimeCompleted = uniqueStrings([
      ...state.runtimeCompleted,
      `form_fill succeeded for ${fieldRefIds.join(', ')}`
    ]).slice(-MAX_TASK_STATE_ITEMS);
    state.recommendedNextDecision = 'finish';
    state.reason = 'The latest form fill succeeded. If the user did not ask to submit/send/continue, finish instead of repeating the fill.';
  } else {
    state.verifiedFieldRefs = uniqueStrings([...state.verifiedFieldRefs, ...fieldRefIds]);
    state.runtimeCompleted = uniqueStrings([
      ...state.runtimeCompleted,
      `form_verify succeeded for ${fieldRefIds.join(', ')}`
    ]).slice(-MAX_TASK_STATE_ITEMS);
    state.recommendedNextDecision = 'finish';
    state.reason = 'The latest form verification succeeded. If the user did not ask to submit, finish now.';
  }
  state.updatedBy = mergeTaskStateSource(state.updatedBy, 'runtime');
  state.updatedAt = Date.now();
}

function ensureTaskState(record: RunRecord): RuntimeTaskState {
  record.taskState ??= createInitialTaskState(redactTextForModelContext(record.task));
  return record.taskState;
}

export function createInitialTaskState(goal: string): RuntimeTaskState {
  return {
    goal,
    completed: [],
    remaining: [goal],
    filledFieldRefs: [],
    verifiedFieldRefs: [],
    runtimeCompleted: [],
    runtimeFactsOverrideModelNotes: true,
    updatedBy: 'runtime',
    updatedAt: Date.now()
  };
}

export function compactTaskState(state: RuntimeTaskState): RuntimeTaskState {
  return {
    goal: safeTaskStateText(state.goal),
    completed: safeTaskStateList(state.completed).slice(-MAX_TASK_STATE_ITEMS),
    remaining: safeTaskStateList(state.remaining).slice(0, MAX_TASK_STATE_ITEMS),
    ...(state.recommendedNextDecision ? { recommendedNextDecision: state.recommendedNextDecision } : {}),
    ...(state.reason ? { reason: safeTaskStateText(state.reason) } : {}),
    filledFieldRefs: uniqueStrings(state.filledFieldRefs).slice(-MAX_TASK_STATE_ITEMS),
    verifiedFieldRefs: uniqueStrings(state.verifiedFieldRefs).slice(-MAX_TASK_STATE_ITEMS),
    runtimeCompleted: safeTaskStateList(state.runtimeCompleted).slice(-MAX_TASK_STATE_ITEMS),
    runtimeFactsOverrideModelNotes: true,
    updatedBy: state.updatedBy,
    updatedAt: state.updatedAt
  };
}

function fieldRefIdsFromToolResult(result: NonNullable<RunSnapshot['toolResult']>): string[] {
  const data = isRecord(result.detail) && isRecord(result.detail.data)
    ? result.detail.data
    : undefined;
  const fields = Array.isArray(data?.fields)
    ? data.fields
    : Array.isArray(data?.fieldResults)
      ? data.fieldResults
      : undefined;
  if (!fields) {
    return [];
  }
  return uniqueStrings(fields
    .map((field) => isRecord(field) ? stringField(field, 'fieldRefId') : undefined)
    .filter((value): value is string => Boolean(value)));
}

function mergeTaskStateSource(
  current: RuntimeTaskState['updatedBy'],
  incoming: 'runtime' | 'model'
): RuntimeTaskState['updatedBy'] {
  return current === incoming ? current : 'runtime_and_model';
}

function safeTaskStateList(values: string[]): string[] {
  return values
    .map(safeTaskStateText)
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
}

function safeTaskStateText(value: string): string {
  return truncateStr(redactTextForModelContext(value), MAX_TASK_STATE_TEXT_CHARS) ?? '';
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function truncateStr(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return value;
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + '…[truncated]';
}
