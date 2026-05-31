import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { isFormFillTool } from './form-fill-augmenter';

const MAX_RECENT_ACTION_HISTORY = 8;
const MAX_TRACE_HISTORY_SUMMARY_CHARS = 80;

export type RecentToolAction = {
  tool: string;
  ok: boolean;
  code?: string | undefined;
  summary?: string | undefined;
  changedPage?: boolean | undefined;
  args?: unknown;
  fieldRefIds?: string[] | undefined;
};

export function buildRecentToolActions(trace: RuntimeEvent[] | undefined): RecentToolAction[] {
  const actions: RecentToolAction[] = [];
  let pending: { tool: string; args?: unknown } | undefined;
  for (const event of trace ?? []) {
    const payload = eventPayload(event);
    if (event.type === TRACE_EVENT_NAMES.TOOL_STARTED) {
      const tool = stringField(payload, 'tool');
      pending = tool ? { tool, args: payload.args } : undefined;
      continue;
    }
    if (event.type !== TRACE_EVENT_NAMES.TOOL_RESULT) {
      continue;
    }
    const tool = stringField(payload, 'tool');
    if (!tool) {
      pending = undefined;
      continue;
    }
    const args = pending?.tool === tool ? pending.args : undefined;
    actions.push({
      tool,
      args,
      ok: payload.ok === true,
      code: stringField(payload, 'code'),
      summary: truncateStr(stringField(payload, 'summary'), MAX_TRACE_HISTORY_SUMMARY_CHARS),
      changedPage: payload.changedPage === true,
      fieldRefIds: fieldRefIdsFromToolArgs(tool, args)
    });
    pending = undefined;
  }
  return actions.slice(-MAX_RECENT_ACTION_HISTORY).map((action) => ({
    tool: action.tool,
    ok: action.ok,
    code: action.code,
    summary: action.summary,
    ...(action.changedPage ? { changedPage: true } : {}),
    ...(action.fieldRefIds?.length ? { fieldRefIds: action.fieldRefIds } : {})
  }));
}

function fieldRefIdsFromToolArgs(tool: string, args: unknown): string[] | undefined {
  if (!isFormFillTool(tool) && tool !== TOOL_NAMES.FORM_VERIFY) {
    return undefined;
  }
  if (!isRecord(args)) {
    return undefined;
  }
  if (Array.isArray(args.fields)) {
    const refs = args.fields
      .map((field) => isRecord(field) ? stringField(field, 'fieldRefId') : undefined)
      .filter((value): value is string => Boolean(value));
    return refs.length ? refs : undefined;
  }
  if (Array.isArray(args.fieldRefIds)) {
    const refs = args.fieldRefIds.filter((value): value is string =>
      typeof value === 'string' && value.trim().length > 0
    );
    return refs.length ? refs : undefined;
  }
  const fieldRefId = stringField(args, 'fieldRefId');
  return fieldRefId ? [fieldRefId] : undefined;
}

function eventPayload(event: RuntimeEvent): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncateStr(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return value;
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + '…[truncated]';
}
