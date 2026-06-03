import { describe, expect, it } from 'vitest';

import { verifyTaskCompletionBeforeFinish } from '../../../../src/agent/verification/task-verifier';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('workflow postcondition semantic verifier', () => {
  it('denies finish when workflow replay only has shape-level score evidence', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
          ok: true,
          code: 'OK',
          summary: 'Workflow replay completed'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_SCORE,
          ok: true,
          code: 'OK',
          summary: 'Scored workflow'
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: false,
      status: 'unknown',
      verifier: 'workflow_postcondition',
      missingEvidence: ['workflow_postcondition_evidence']
    });
  });

  it('passes when workflow score contains passed postcondition evidence', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
          ok: true,
          code: 'OK',
          summary: 'Workflow replay completed'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_SCORE,
          ok: true,
          code: 'OK',
          summary: 'Scored workflow',
          data: {
            passed: true,
            evidence: [{ kind: 'text', value: 'Invoice saved' }]
          }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'workflow_postcondition'
    });
  });
});
