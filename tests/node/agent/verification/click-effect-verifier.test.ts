import { describe, expect, it } from 'vitest';

import { verifyTaskCompletionBeforeFinish } from '../../../../src/agent/verification/task-verifier';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('click effect semantic verifier', () => {
  it('denies finish when click only has changedPage and follow-up observe shape', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.ACTION_CLICK,
          ok: true,
          code: 'OK',
          summary: 'Clicked',
          changedPage: true,
          requiresObserve: true
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Observed page'
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: false,
      status: 'unknown',
      verifier: 'click_effect',
      missingEvidence: ['click_effect_evidence']
    });
  });

  it('passes when expected effect text appears after the click', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        payload: {
          tool: TOOL_NAMES.ACTION_CLICK,
          args: { refId: 'ref_continue', expectedEffectText: 'Settings' }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.ACTION_CLICK,
          ok: true,
          code: 'OK',
          summary: 'Clicked Continue',
          changedPage: true,
          requiresObserve: true
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Settings page',
          data: { visibleTextSummary: 'Settings' }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'click_effect'
    });
  });
});
