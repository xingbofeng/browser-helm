import type { AgentDecision } from '../../shared/schemas/agent-decision.schema';
import { INTERNAL_TOOL_NAMES } from '../../shared/constants/internal-tool-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';

const SENSITIVE_TEXT_TOOLS = new Set<string>([
  TOOL_NAMES.FORM_FILL_FIELD,
  TOOL_NAMES.FORM_FILL_MANY,
  TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
  TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
  INTERNAL_TOOL_NAMES.IFRAME_TYPE,
]);

export function redactToolArgs(tool: string, args: unknown): unknown {
  if (!isRecord(args)) {
    return args;
  }
  if (tool === TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL) {
    return redactFileUploadArgs(args);
  }
  if (!SENSITIVE_TEXT_TOOLS.has(tool)) {
    return cloneRecord(args);
  }

  const redacted = cloneRecord(args);
  if ('text' in redacted) {
    delete redacted.text;
  }
  if ('value' in redacted) {
    delete redacted.value;
  }
  if (Array.isArray(redacted.fields)) {
    redacted.fields = redacted.fields.map(redactFieldTarget);
  }
  if (!('valuePreview' in redacted)) {
    redacted.valuePreview = {
      masked: true,
      preview: '[MASKED]',
      reason: 'redacted'
    };
  }
  return redacted;
}

function redactFileUploadArgs(args: Record<string, unknown>): Record<string, unknown> {
  const redacted = cloneRecord(args);
  if (typeof redacted.fileName === 'string') {
    redacted.fileName = redacted.fileName.split(/[\\/]/u).filter(Boolean).at(-1) ?? redacted.fileName;
  }
  return redacted;
}

function redactFieldTarget(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const redacted = cloneRecord(value);
  if ('value' in redacted) {
    delete redacted.value;
  }
  redacted.valuePreview = {
    masked: true,
    preview: '[MASKED]',
    reason: 'redacted'
  };
  return redacted;
}

export function redactDecisionForTrace(decision: AgentDecision): AgentDecision {
  if (decision.type !== 'tool_call') {
    return decision;
  }
  return {
    ...decision,
    args: redactToolArgsRecord(decision.tool, decision.args)
  };
}

export function redactModelOutputText(rawText: string): string {
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (!isRecord(parsed) || parsed.type !== 'tool_call') {
      return rawText;
    }
    return JSON.stringify({
      ...parsed,
      args: redactToolArgs(String(parsed.tool), parsed.args)
    });
  } catch {
    return rawText;
  }
}

function redactToolArgsRecord(
  tool: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const redacted = redactToolArgs(tool, args);
  return isRecord(redacted) ? redacted : {};
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
