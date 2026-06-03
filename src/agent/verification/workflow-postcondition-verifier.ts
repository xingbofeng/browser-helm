import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { TaskVerificationResult, VerificationInput } from './verifier-utils';
import {
  fail,
  isRecord,
  pass,
  toolEvents
} from './verifier-utils';

export function verifyWorkflowPostconditionCompletion(input: VerificationInput): TaskVerificationResult {
  const workflowRun = toolEvents(input.trace, TOOL_NAMES.FLOW_RUN_WITH_APPROVAL).at(-1);
  if (!workflowRun) {
    return fail('workflow_postcondition', 'unknown', 'No workflow replay result exists.', ['workflow_replay_result']);
  }
  const score = toolEvents(input.trace, TOOL_NAMES.FLOW_SCORE).at(-1);
  if (!score || !isRecord(score.payload)) {
    return fail('workflow_postcondition', 'unknown', 'Workflow replay has no postcondition score evidence.', ['workflow_score'], [], TOOL_NAMES.FLOW_SCORE);
  }
  const data = isRecord(score.payload.data) ? score.payload.data : {};
  const evidence = Array.isArray(data.evidence) ? data.evidence : [];
  const passed = data.passed === true || data.postconditionsPassed === true;
  if (passed && evidence.length > 0) {
    return pass('workflow_postcondition', 'Workflow postconditions passed with structured evidence.', [
      { kind: 'workflow_postcondition', summary: `${evidence.length} evidence item(s)`, tool: TOOL_NAMES.FLOW_SCORE }
    ]);
  }
  return fail(
    'workflow_postcondition',
    data.passed === false || data.postconditionsPassed === false ? 'fail' : 'unknown',
    'Workflow score is present but lacks passed postcondition evidence.',
    ['workflow_postcondition_evidence'],
    [],
    TOOL_NAMES.FLOW_SCORE
  );
}
