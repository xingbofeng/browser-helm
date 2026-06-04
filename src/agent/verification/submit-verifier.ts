import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { TaskVerificationResult, VerificationInput } from './verifier-utils';
import {
  collectObservationText,
  fail,
  isRecord,
  latestPayload,
  numberField,
  pass,
  stringField,
  structuredPassedEvidence,
  subsequentSuccessfulObservation
} from './verifier-utils';

export function verifySubmitCompletion(input: VerificationInput): TaskVerificationResult {
  const submit = latestPayload(input.trace, TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT);
  if (!submit) {
    return fail('submit', 'unknown', 'No form submit result exists.', ['submit_result'], [], TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL);
  }
  const observation = subsequentSuccessfulObservation(input.trace, submit.index);
  if (!observation) {
    return fail(
      'submit',
      'unknown',
      'Form submit result has no post-submit page observation evidence.',
      ['post_submit_observation'],
      [],
      TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL
    );
  }

  const outcome = stringField(submit.payload, 'outcome');
  const text = collectObservationText(input.trace, submit.index);
  if (hasErrorEvidence(text) || outcome === 'error' || outcome === 'fail' || outcome === 'failed') {
    return fail('submit', 'fail', 'Post-submit page evidence shows an error.', ['submit_success_evidence'], [
      { kind: 'post_submit_observation', summary: text.slice(0, 160), tool: TOOL_NAMES.PAGE_OBSERVE }
    ], TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL);
  }
  const structuredEvidence = structuredPassedEvidence(
    submit.payload,
    ['successEvidence', 'postSubmitEvidence', 'evidence'],
    TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL
  );
  if (structuredEvidence.length > 0) {
    return pass('submit', 'Submit result includes structured success evidence and post-submit observation.', structuredEvidence);
  }
  const lifecycleEvidence = submitLifecycleEvidence(input.trace, submit.index, observation);
  if (lifecycleEvidence.length > 0) {
    return pass('submit', 'Submit result has post-submit lifecycle evidence.', lifecycleEvidence);
  }
  if (hasSuccessEvidence(text) || outcome === 'success' || outcome === 'redirected' || outcome === 'form_reset') {
    return pass('submit', 'Submit result and post-submit evidence show success.', [
      { kind: 'post_submit_observation', summary: text.slice(0, 160), tool: TOOL_NAMES.PAGE_OBSERVE }
    ]);
  }
  return fail('submit', 'unknown', 'Post-submit evidence is inconclusive.', ['submit_success_evidence'], [
    { kind: 'post_submit_observation', summary: text.slice(0, 160), tool: TOOL_NAMES.PAGE_OBSERVE }
  ], TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL);
}

function hasSuccessEvidence(value: string): boolean {
  return /(?:thank you|submitted|success|saved|received|complete|已提交|提交成功|成功|已保存)/iu.test(value);
}

function hasErrorEvidence(value: string): boolean {
  return /(?:not\s+successful|unsuccessful|not\s+submitted|not\s+saved|error|failed|invalid|required|try again|失败|未成功|未提交|错误|无效|必填|请重试)/iu.test(value);
}

function submitLifecycleEvidence(
  trace: VerificationInput['trace'],
  submitIndex: number,
  observation: VerificationInput['trace'][number]
) {
  const evidence = [];
  const before = latestSuccessfulObservationBefore(trace, submitIndex);
  const beforeUrl = observationUrl(before);
  const afterUrl = observationUrl(observation);
  if (beforeUrl && afterUrl && beforeUrl !== afterUrl) {
    evidence.push({
      kind: 'post_submit_url_change',
      summary: `${beforeUrl} -> ${afterUrl}`,
      tool: TOOL_NAMES.PAGE_OBSERVE
    });
  }

  const networkStatus = firstSuccessfulNetworkStatus(trace, submitIndex);
  if (networkStatus !== undefined) {
    evidence.push({
      kind: 'post_submit_network_2xx',
      summary: `HTTP ${networkStatus}`,
      tool: TOOL_NAMES.CDP_GET_NETWORK_EVENTS
    });
  }

  const beforeFormCount = observationFormCount(before);
  const afterFormCount = observationFormCount(observation);
  if (beforeFormCount !== undefined && beforeFormCount > 0 && afterFormCount === 0) {
    evidence.push({
      kind: 'post_submit_form_disappeared',
      summary: `forms ${beforeFormCount} -> 0`,
      tool: TOOL_NAMES.PAGE_OBSERVE
    });
  }
  return evidence;
}

function latestSuccessfulObservationBefore(
  trace: VerificationInput['trace'],
  index: number
): VerificationInput['trace'][number] | undefined {
  for (let current = index - 1; current >= 0; current -= 1) {
    const event = trace[current];
    if (
      event?.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
      isRecord(event.payload) &&
      event.payload.tool === TOOL_NAMES.PAGE_OBSERVE &&
      event.payload.ok === true
    ) {
      return event;
    }
  }
  return undefined;
}

function observationUrl(event: VerificationInput['trace'][number] | undefined): string | undefined {
  if (!event || !isRecord(event.payload)) {
    return undefined;
  }
  return stringField(event.payload, 'url') ??
    (isRecord(event.payload.data) ? stringField(event.payload.data, 'url') : undefined) ??
    (isRecord(event.payload.detail) && isRecord(event.payload.detail.data)
      ? stringField(event.payload.detail.data, 'url')
      : undefined);
}

function observationFormCount(event: VerificationInput['trace'][number] | undefined): number | undefined {
  if (!event || !isRecord(event.payload)) {
    return undefined;
  }
  return findFormsCount(event.payload);
}

function findFormsCount(value: unknown, depth = 0): number | undefined {
  if (depth > 6) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const count = findFormsCount(item, depth + 1);
      if (count !== undefined) return count;
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (isRecord(value.forms)) {
    const count = numberField(value.forms, 'count');
    if (count !== undefined) {
      return count;
    }
  }
  for (const nested of Object.values(value)) {
    const count = findFormsCount(nested, depth + 1);
    if (count !== undefined) return count;
  }
  return undefined;
}

function firstSuccessfulNetworkStatus(
  trace: VerificationInput['trace'],
  submitIndex: number
): number | undefined {
  for (const event of trace.slice(submitIndex + 1)) {
    if (
      event.type !== TRACE_EVENT_NAMES.TOOL_RESULT ||
      !isRecord(event.payload) ||
      event.payload.tool !== TOOL_NAMES.CDP_GET_NETWORK_EVENTS ||
      event.payload.ok !== true
    ) {
      continue;
    }
    const status = findHttpStatus(event.payload);
    if (status !== undefined && status >= 200 && status < 300) {
      return status;
    }
  }
  return undefined;
}

function findHttpStatus(value: unknown, depth = 0): number | undefined {
  if (depth > 6) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const status = findHttpStatus(item, depth + 1);
      if (status !== undefined) return status;
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const status = numberField(value, 'status') ?? numberField(value, 'statusCode');
  if (status !== undefined) {
    return status;
  }
  for (const nested of Object.values(value)) {
    const nestedStatus = findHttpStatus(nested, depth + 1);
    if (nestedStatus !== undefined) return nestedStatus;
  }
  return undefined;
}
