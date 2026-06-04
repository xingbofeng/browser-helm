import { describe, expect, it } from 'vitest';

import { verifyTaskCompletionBeforeFinish } from '../../../../src/agent/verification/task-verifier';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('submit semantic verifier', () => {
  it('returns unknown when submit executes but post-submit evidence is inconclusive', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'unknown',
          summary: 'Submitted'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Observed same page',
          data: { visibleTextSummary: 'Contact form' }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: false,
      status: 'unknown',
      verifier: 'submit',
      missingEvidence: ['submit_success_evidence'],
      nextAction: 'continue'
    });
  });

  it('passes when submit result and post-submit page evidence show success', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'success',
          summary: 'Form submitted successfully'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Thank you page',
          data: { visibleTextSummary: 'Thank you, your request was submitted.' }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'submit'
    });
  });

  it('passes when submit result has structured success evidence and a post-submit observation', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'unknown',
          summary: 'Submitted',
          data: {
            successEvidence: [
              {
                kind: 'dom_state',
                passed: true,
                summary: 'Confirmation dialog rendered'
              }
            ]
          }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Observed neutral page',
          data: { visibleTextSummary: 'Contact form' }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'submit'
    });
  });

  it('fails when post-submit page evidence shows an error', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'success',
          summary: 'Submitted'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Validation error page',
          data: { visibleTextSummary: 'Error: email is required.' }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: false,
      status: 'fail',
      verifier: 'submit',
      missingEvidence: ['submit_success_evidence']
    });
  });
});
