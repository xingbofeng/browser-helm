import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { TaskVerificationResult, VerificationInput } from './verifier-utils';
import {
  fail,
  hasInsufficientEvidenceLanguage,
  isRecord,
  pass,
  passUnknown,
  recordTextValues,
  toolName
} from './verifier-utils';

const DIAGNOSTIC_TOOLS = new Set<string>([
  TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
  TOOL_NAMES.CDP_GET_CONSOLE_EVENTS,
  TOOL_NAMES.CDP_GET_NETWORK_EVENTS,
  TOOL_NAMES.CDP_GET_REQUEST_DETAIL,
  TOOL_NAMES.CDP_GET_RESPONSE_BODY,
  TOOL_NAMES.CDP_GET_PERFORMANCE_METRICS,
  TOOL_NAMES.CDP_GET_EVENT_LISTENERS,
  TOOL_NAMES.CDP_CAPTURE_DOM_SNAPSHOT
]);

export function verifyDebugFindingCompletion(input: VerificationInput): TaskVerificationResult {
  if (hasInsufficientEvidenceLanguage(input.finalMessage)) {
    return passUnknown('debug', 'Debug answer explicitly states diagnostics are insufficient.', ['diagnostic_evidence']);
  }
  const diagnostics = input.trace.filter((event) =>
    (
      event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
      isRecord(event.payload) &&
      typeof event.payload.tool === 'string' &&
      DIAGNOSTIC_TOOLS.has(event.payload.tool) &&
      event.payload.ok === true
    ) ||
    event.type === TRACE_EVENT_NAMES.FINDINGS_REPORTED ||
    event.type === TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED
  );
  if (diagnostics.length === 0) {
    if (isGenericDebugCompletion(input.finalMessage)) {
      return passUnknown('debug', 'Debug answer reports completion without a concrete finding claim.', ['diagnostic_evidence']);
    }
    return fail('debug', 'unknown', 'Debug completion has no collected diagnostic evidence.', ['diagnostic_evidence']);
  }
  const diagnosticText = diagnostics.flatMap((event) => recordTextValues(event.payload)).join(' ');
  if (!diagnosticText.trim()) {
    return fail('debug', 'unknown', 'Debug diagnostics are empty.', ['diagnostic_evidence']);
  }
  return pass('debug', 'Debug completion is grounded in collected diagnostics.', diagnostics.map((event) => ({
    kind: 'diagnostic',
    summary: diagnosticText.slice(0, 160),
    tool: toolName(event)
  })));
}

function isGenericDebugCompletion(value: string | undefined): boolean {
  if (!value) return false;
  return /(?:diagnostics? (?:complete|completed)|diagnosis (?:complete|completed)|诊断已完成|调试摘要)/iu.test(value);
}
