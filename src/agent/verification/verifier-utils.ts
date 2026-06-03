import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';

export type SemanticVerifierName =
  | 'answer'
  | 'form'
  | 'submit'
  | 'navigation'
  | 'click_effect'
  | 'workflow_postcondition'
  | 'debug'
  | 'trace_shape'
  | 'compatibility';

export type SemanticVerificationStatus = 'pass' | 'fail' | 'unknown';
export type SemanticNextAction = 'finish' | 'continue' | 'waiting_for_user';

export type SemanticEvidence = {
  kind: string;
  summary: string;
  tool?: string | undefined;
};

export type TaskVerificationResult = {
  ok: boolean;
  status: SemanticVerificationStatus;
  verifier: SemanticVerifierName;
  evidence: SemanticEvidence[];
  missingEvidence: string[];
  reason: string;
  nextAction: SemanticNextAction;
  tool?: string | undefined;
};

export type VerificationInput = {
  trace: RuntimeEvent[];
  finalMessage?: string | undefined;
};

export function pass(
  verifier: SemanticVerifierName,
  reason: string,
  evidence: SemanticEvidence[] = []
): TaskVerificationResult {
  return {
    ok: true,
    status: 'pass',
    verifier,
    evidence,
    missingEvidence: [],
    reason,
    nextAction: 'finish'
  };
}

export function passUnknown(
  verifier: SemanticVerifierName,
  reason: string,
  missingEvidence: string[],
  evidence: SemanticEvidence[] = []
): TaskVerificationResult {
  return {
    ok: true,
    status: 'unknown',
    verifier,
    evidence,
    missingEvidence,
    reason,
    nextAction: 'finish'
  };
}

export function fail(
  verifier: SemanticVerifierName,
  status: Exclude<SemanticVerificationStatus, 'pass'>,
  reason: string,
  missingEvidence: string[],
  evidence: SemanticEvidence[] = [],
  tool?: string
): TaskVerificationResult {
  return {
    ok: false,
    status,
    verifier,
    evidence,
    missingEvidence,
    reason,
    nextAction: status === 'fail' ? 'waiting_for_user' : 'continue',
    ...(tool ? { tool } : {})
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function booleanField(record: Record<string, unknown> | undefined, key: string): boolean | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function numberField(record: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function toolName(event: RuntimeEvent): string | undefined {
  return isRecord(event.payload) ? stringField(event.payload, 'tool') : undefined;
}

export function toolEvents(trace: RuntimeEvent[], tool: string): RuntimeEvent[] {
  return trace.filter((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
    isRecord(event.payload) &&
    event.payload.tool === tool
  );
}

export function hasToolResult(trace: RuntimeEvent[], tool: string): boolean {
  return toolEvents(trace, tool).some((event) =>
    isRecord(event.payload) && event.payload.ok === true
  );
}

export function hasAnyToolResult(trace: RuntimeEvent[], tools: ReadonlySet<string>): boolean {
  return trace.some((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
    isRecord(event.payload) &&
    typeof event.payload.tool === 'string' &&
    tools.has(event.payload.tool) &&
    event.payload.ok === true
  );
}

export function runMode(trace: RuntimeEvent[]): string | undefined {
  const started = trace.find((event) => event.type === TRACE_EVENT_NAMES.RUN_STARTED);
  return isRecord(started?.payload) ? stringField(started.payload, 'mode') : undefined;
}

export function latestToolStartedArgsBefore(
  trace: RuntimeEvent[],
  index: number,
  tool: string
): Record<string, unknown> | undefined {
  for (let current = index - 1; current >= 0; current -= 1) {
    const event = trace[current];
    if (
      event?.type === TRACE_EVENT_NAMES.TOOL_STARTED &&
      isRecord(event.payload) &&
      event.payload.tool === tool &&
      isRecord(event.payload.args)
    ) {
      return event.payload.args;
    }
  }
  return undefined;
}

export function latestPayload(
  trace: RuntimeEvent[],
  type: string,
  predicate?: (payload: Record<string, unknown>, index: number) => boolean
): { payload: Record<string, unknown>; index: number } | undefined {
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const event = trace[index];
    if (event?.type !== type || !isRecord(event.payload)) continue;
    if (!predicate || predicate(event.payload, index)) {
      return { payload: event.payload, index };
    }
  }
  return undefined;
}

export function subsequentSuccessfulObservation(trace: RuntimeEvent[], index: number): RuntimeEvent | undefined {
  return trace.slice(index + 1).find((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
    isRecord(event.payload) &&
    event.payload.tool === TOOL_NAMES.PAGE_OBSERVE &&
    event.payload.ok === true
  );
}

export function collectObservationText(trace: RuntimeEvent[], startIndex = -1): string {
  const parts: string[] = [];
  trace.slice(startIndex + 1).forEach((event) => {
    if (
      event.type !== TRACE_EVENT_NAMES.TOOL_RESULT ||
      !isRecord(event.payload) ||
      !ANSWER_EVIDENCE_TOOLS.has(String(event.payload.tool)) ||
      event.payload.ok !== true
    ) {
      return;
    }
    parts.push(...recordTextValues(event.payload));
  });
  return normalizeText(parts.join(' '));
}

const ANSWER_EVIDENCE_TOOLS = new Set<string>([
  TOOL_NAMES.PAGE_OBSERVE,
  TOOL_NAMES.PAGE_READ_ARTICLE,
  TOOL_NAMES.PAGE_READ_VISIBLE_TEXT,
  TOOL_NAMES.IFRAME_READ,
  TOOL_NAMES.DOC_READ_URL,
  TOOL_NAMES.FORM_READ_FIELDS,
  TOOL_NAMES.FORM_FIND_MISSING_REQUIRED,
  TOOL_NAMES.FORM_FIND_VALIDATION_ERRORS,
  TOOL_NAMES.FORM_FIND_DISABLED_SUBMIT_REASON,
  TOOL_NAMES.STORAGE_LIST,
  TOOL_NAMES.STORAGE_GET
]);

export function recordTextValues(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => recordTextValues(item, depth + 1));
  }
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap((item) => recordTextValues(item, depth + 1));
}

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function textIncludes(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeText(needle);
  return normalizedNeedle.length > 0 && normalizeText(haystack).includes(normalizedNeedle);
}

export function meaningfulTokens(value: string): string[] {
  const tokens = normalizeText(value)
    .replace(/[^\p{L}\p{N}$._@-]+/gu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length >= 3 || /\d/u.test(token));
  return [...new Set(tokens)];
}

export function numericTokens(value: string): string[] {
  return [...value.matchAll(/[$]?\d+(?:[.,]\d+)?/gu)]
    .filter((match) => !value.slice(Math.max(0, (match.index ?? 0) - 4), match.index).endsWith('ref_'))
    .map((match) => match[0]);
}

export function hasInsufficientEvidenceLanguage(value: string | undefined): boolean {
  if (!value) return false;
  return /(?:insufficient|not enough|do not have enough|can't determine|cannot determine|无法|证据不足|无法确定|无法判断|没有足够证据)/iu.test(value);
}

export function hasUnableToCompleteRequiredActionLanguage(value: string | undefined): boolean {
  if (!value) return false;
  return /(?:unable to (?:execute|complete|perform)|cannot (?:execute|complete|perform)|can't (?:execute|complete|perform)|skipp?ed|mode (?:restriction|limit)|无法(?:执行|完成)|不能(?:执行|完成)|跳过|模式限制|当前模式限制)/iu.test(value);
}
