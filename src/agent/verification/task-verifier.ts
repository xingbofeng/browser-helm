import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { verifyAnswerCompletion } from './answer-verifier';
import { verifyClickEffectCompletion } from './click-effect-verifier';
import { verifyDebugFindingCompletion } from './debug-finding-verifier';
import { verifyFormCompletion } from './form-verifier';
import { verifySubmitCompletion } from './submit-verifier';
import { verifyWorkflowPostconditionCompletion } from './workflow-postcondition-verifier';
import {
  fail,
  hasToolResult,
  isRecord,
  pass,
  runMode,
  stringField,
  toolName,
  type TaskVerificationResult
} from './verifier-utils';

export type { TaskVerificationResult } from './verifier-utils';

export type TaskVerificationOptions = {
  finalMessage?: string | undefined;
};

const MUTATING_EVIDENCE_TOOLS = new Set<string>([
  TOOL_NAMES.ACTION_CLICK,
  TOOL_NAMES.FORM_FILL_FIELD,
  TOOL_NAMES.FORM_FILL_MANY,
  TOOL_NAMES.POINTER_CLICK,
  TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL
]);

export function verifyTaskCompletionBeforeFinish(
  trace: RuntimeEvent[] | undefined,
  options: TaskVerificationOptions = {}
): TaskVerificationResult {
  const events = trace ?? [];
  const requiredTools = missingExplicitlyRequestedTools(events);
  if (requiredTools.length > 0) {
    return fail(
      'trace_shape',
      'unknown',
      `Required tool was not called before finishing: ${requiredTools.join(', ')}`,
      requiredTools.map((tool) => `required_tool:${tool}`),
      [],
      requiredTools[0]
    );
  }
  const missingPostconditionTools = missingExplicitPostconditionTools(events);
  if (missingPostconditionTools.length > 0) {
    return fail(
      'trace_shape',
      'unknown',
      `Required post-action tool was not called before finishing: ${missingPostconditionTools.join(', ')}`,
      missingPostconditionTools.map((tool) => `required_tool:${tool}`),
      [],
      missingPostconditionTools[0]
    );
  }
  const traceShape = verifyTraceShape(events);
  if (!traceShape.ok) return traceShape;

  if (hasToolResult(events, TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL) ||
    events.some((event) => event.type === TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT)) {
    return verifySubmitCompletion({ trace: events, finalMessage: options.finalMessage });
  }
  if (hasToolResult(events, TOOL_NAMES.FLOW_RUN_WITH_APPROVAL)) {
    return verifyWorkflowPostconditionCompletion({ trace: events, finalMessage: options.finalMessage });
  }
  if (hasToolResult(events, TOOL_NAMES.ACTION_CLICK) || hasToolResult(events, TOOL_NAMES.POINTER_CLICK)) {
    return verifyClickEffectCompletion({ trace: events, finalMessage: options.finalMessage });
  }
  if (hasFormFillEvidence(events)) {
    return verifyFormCompletion({ trace: events, finalMessage: options.finalMessage });
  }
  if (runMode(events) === 'debug') {
    return verifyDebugFindingCompletion({ trace: events, finalMessage: options.finalMessage });
  }
  if (options.finalMessage || runMode(events) === 'ask') {
    return verifyAnswerCompletion({ trace: events, finalMessage: options.finalMessage });
  }

  return pass('compatibility', 'No semantic verifier was required for this trace.');
}

function verifyTraceShape(events: RuntimeEvent[]): TaskVerificationResult {
  for (const [index, event] of events.entries()) {
    if (event.type === TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT) {
      if (!hasSubsequentSuccessfulObservation(events, index)) {
        return fail(
          'trace_shape',
          'fail',
          'Form submit result has no post-submit page observation evidence',
          ['post_submit_observation'],
          [],
          TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL
        );
      }
      continue;
    }

    if (event.type !== TRACE_EVENT_NAMES.TOOL_RESULT || !isRecord(event.payload)) {
      continue;
    }
    const tool = stringField(event.payload, 'tool');
    if (!tool || event.payload.ok !== true) {
      continue;
    }
    if (
      tool === TOOL_NAMES.FLOW_RUN_WITH_APPROVAL &&
      !hasSubsequentSuccessfulWorkflowScore(events, index)
    ) {
      return fail('trace_shape', 'fail', 'Workflow replay has no postcondition score evidence', ['workflow_score'], [], tool);
    }
    if (
      event.payload.requiresObserve === true &&
      !hasSubsequentObservationEvidence(events, index, tool)
    ) {
      if (tool === TOOL_NAMES.VIEWPORT_SCROLL) {
        return fail(
          'trace_shape',
          'unknown',
          `${tool} requires a follow-up visible text read before finishing`,
          [`required_tool:${TOOL_NAMES.PAGE_READ_VISIBLE_TEXT}`],
          [],
          TOOL_NAMES.PAGE_READ_VISIBLE_TEXT
        );
      }
      return fail('trace_shape', 'fail', `${tool} requires a follow-up page observation before finishing`, ['follow_up_observation'], [], tool);
    }
    if (!MUTATING_EVIDENCE_TOOLS.has(tool)) {
      continue;
    }
    if (event.payload.changedPage !== true) {
      return fail('trace_shape', 'fail', `${tool} reported success without page change evidence`, ['page_change_evidence'], [], tool);
    }
  }
  return pass('trace_shape', 'Trace-shape checks passed.');
}

function hasSubsequentSuccessfulObservation(events: RuntimeEvent[], index: number): boolean {
  return events.slice(index + 1).some((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
    isRecord(event.payload) &&
    event.payload.tool === TOOL_NAMES.PAGE_OBSERVE &&
    event.payload.ok === true
  );
}

function hasSubsequentObservationEvidence(events: RuntimeEvent[], index: number, tool: string): boolean {
  if (hasSubsequentSuccessfulObservation(events, index)) {
    return true;
  }
  if (tool !== TOOL_NAMES.VIEWPORT_SCROLL) {
    return false;
  }
  return events.slice(index + 1).some((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
    isRecord(event.payload) &&
    event.payload.ok === true &&
    (event.payload.tool === TOOL_NAMES.PAGE_READ_VISIBLE_TEXT ||
      event.payload.tool === TOOL_NAMES.VIEWPORT_GET_INFO)
  );
}

function hasSubsequentSuccessfulWorkflowScore(events: RuntimeEvent[], index: number): boolean {
  return events.slice(index + 1).some((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
    isRecord(event.payload) &&
    event.payload.tool === TOOL_NAMES.FLOW_SCORE &&
    event.payload.ok === true
  );
}

function hasFormFillEvidence(events: RuntimeEvent[]): boolean {
  return events.some((event) =>
    event.type === TRACE_EVENT_NAMES.FIELD_FILL_RESULT ||
    event.type === TRACE_EVENT_NAMES.FORM_VERIFY_RESULT ||
    toolName(event) === TOOL_NAMES.FORM_FILL_FIELD ||
    toolName(event) === TOOL_NAMES.FORM_FILL_MANY
  );
}

function missingExplicitlyRequestedTools(events: RuntimeEvent[]): string[] {
  const task = events
    .filter((event) => event.type === TRACE_EVENT_NAMES.RUN_STARTED)
    .map((event) => isRecord(event.payload) ? stringField(event.payload, 'task') : undefined)
    .find((value): value is string => Boolean(value));
  if (!task) {
    return [];
  }
  const requestedToolGroups = explicitlyRequestedToolGroups(task);
  if (requestedToolGroups.length === 0) {
    return [];
  }
  const calledTools = new Set(
    events
      .filter((event) =>
      (event.type === TRACE_EVENT_NAMES.TOOL_STARTED ||
        event.type === TRACE_EVENT_NAMES.TOOL_RESULT)
      )
      .map(toolName)
      .filter((tool): tool is string => Boolean(tool))
  );
  return requestedToolGroups
    .filter((group) => !conditionalFormFillUnavailable(task, events, group))
    .filter((group) => !group.some((tool) => calledTools.has(tool)))
    .flat();
}

function missingExplicitPostconditionTools(events: RuntimeEvent[]): string[] {
  const task = events
    .filter((event) => event.type === TRACE_EVENT_NAMES.RUN_STARTED)
    .map((event) => isRecord(event.payload) ? stringField(event.payload, 'task') : undefined)
    .find((value): value is string => Boolean(value));
  if (!task || !requiresReadFieldsAfterFill(task)) {
    return [];
  }
  const latestFillIndex = latestFormFillIndex(events);
  if (latestFillIndex < 0) {
    return [];
  }
  const hasReadAfterFill = events.slice(latestFillIndex + 1).some((event) =>
    (event.type === TRACE_EVENT_NAMES.TOOL_STARTED ||
      event.type === TRACE_EVENT_NAMES.TOOL_RESULT) &&
    toolName(event) === TOOL_NAMES.FORM_READ_FIELDS
  );
  return hasReadAfterFill ? [] : [TOOL_NAMES.FORM_READ_FIELDS];
}

function conditionalFormFillUnavailable(task: string, events: RuntimeEvent[], tools: string[]): boolean {
  if (!tools.some((tool) => tool === TOOL_NAMES.FORM_FILL_FIELD || tool === TOOL_NAMES.FORM_FILL_MANY)) {
    return false;
  }
  if (!/(?:当|如果|若)[^。.!?\n]*(?:搜索框|字段|页面)[^。.!?\n]*(?:可用|出现|不是\s*Cloudflare|不是\s*Just a moment)/iu.test(task)) {
    return false;
  }
  const evidence = events
    .filter((event) => event.type === TRACE_EVENT_NAMES.TOOL_RESULT && isRecord(event.payload))
    .map((event) => JSON.stringify(event.payload).toLowerCase())
    .join(' ');
  return /cloudflare|just a moment|security verification|安全验证/u.test(evidence) &&
    /read 0 fields|检测到 0 个字段|0 fields/u.test(evidence);
}

function requiresReadFieldsAfterFill(task: string): boolean {
  return /填写后[^。.!?\n]*(?:再次|再)[^。.!?\n]*bh_form_read_fields|(?:再次|再)调用\s*bh_form_read_fields[^。.!?\n]*(?:复查|确认|检查)字段/u.test(task);
}

function latestFormFillIndex(events: RuntimeEvent[]): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.type === TRACE_EVENT_NAMES.FIELD_FILL_RESULT) {
      return index;
    }
    if (
      (event.type === TRACE_EVENT_NAMES.TOOL_STARTED ||
        event.type === TRACE_EVENT_NAMES.TOOL_RESULT) &&
      (toolName(event) === TOOL_NAMES.FORM_FILL_FIELD ||
        toolName(event) === TOOL_NAMES.FORM_FILL_MANY)
    ) {
      return index;
    }
  }
  return -1;
}

function isNegatedToolMention(task: string, index: number): boolean {
  const prefix = task.slice(Math.max(0, index - 32), index).toLowerCase();
  if (/(?:禁止|不要|不得|不能|避免)(?:调用|使用)?(?:任何)?\s*$|(?:skip|without|do not|don't|not\s+call|never\s+call)\s*$/iu.test(prefix)) {
    return true;
  }
  const sentencePrefix = task
    .slice(Math.max(0, lastInstructionBoundary(task, index) + 1), index)
    .toLowerCase();
  const lastNegationIndex = searchLastIndex(sentencePrefix, /(?:禁止|不要|不得|不能|避免)(?:调用|使用)?|(?:skip|without|do not|don't|not\s+call|never\s+call)/giu);
  if (lastNegationIndex < 0) {
    return false;
  }
  const afterNegation = sentencePrefix.slice(lastNegationIndex);
  return !/(?:必须|需要|应当|请|must|should|need to|please)\s*(?:调用|使用|call|use)?/iu.test(afterNegation);
}

function lastInstructionBoundary(task: string, index: number): number {
  return Math.max(
    task.lastIndexOf('。', index),
    task.lastIndexOf('！', index),
    task.lastIndexOf('!', index),
    task.lastIndexOf('？', index),
    task.lastIndexOf('?', index),
    task.lastIndexOf('\n', index)
  );
}

function searchLastIndex(text: string, pattern: RegExp): number {
  let lastIndex = -1;
  for (const match of text.matchAll(pattern)) {
    lastIndex = match.index ?? lastIndex;
  }
  return lastIndex;
}

function explicitlyRequestedToolGroups(task: string): string[][] {
  const matches = [...task.matchAll(/\bbh_[a-z0-9_]+\b/gu)]
    .filter((match) => !isNegatedToolMention(task, match.index ?? 0));
  const groups: string[][] = [];
  for (const match of matches) {
    const tool = match[0];
    const previousMatch = matches[matches.indexOf(match) - 1];
    if (previousMatch && isAlternativeConnector(task.slice((previousMatch.index ?? 0) + previousMatch[0].length, match.index ?? 0))) {
      groups.at(-1)?.push(tool);
      continue;
    }
    groups.push([tool]);
  }
  return groups.map((group) => [...new Set(group)]);
}

function isAlternativeConnector(text: string): boolean {
  return /^(?:\s|、|，|,|\/)*(?:或|或者|or)(?:\s|、|，|,|\/)*$/iu.test(text);
}
