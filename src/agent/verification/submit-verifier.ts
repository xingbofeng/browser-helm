import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { TaskVerificationResult, VerificationInput } from './verifier-utils';
import {
  collectObservationText,
  fail,
  latestPayload,
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
  return /(?:error|failed|invalid|required|try again|失败|错误|无效|必填|请重试)/iu.test(value);
}
