import type { AgentDecision } from '../../shared/schemas/agent-decision.schema';

const SENSITIVE_TEXT_TOOLS = new Set(['bh_iframe_type']);

export function redactToolArgs(tool: string, args: unknown): unknown {
  if (!isRecord(args)) {
    return args;
  }
  if (!SENSITIVE_TEXT_TOOLS.has(tool)) {
    return cloneRecord(args);
  }

  const redacted = cloneRecord(args);
  if ('text' in redacted) {
    delete redacted.text;
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
