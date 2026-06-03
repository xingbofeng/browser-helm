import { describe, expect, it } from 'vitest';

import { verifyTaskCompletionBeforeFinish } from '../../../../src/agent/verification/task-verifier';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('debug finding semantic verifier', () => {
  it('denies successful debug finish when no diagnostic evidence was collected', () => {
    const trace: RuntimeEvent[] = [{
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.RUN_STARTED,
      payload: { mode: 'debug' }
    }];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: 'The page has a console error.'
    })).toMatchObject({
      ok: false,
      status: 'unknown',
      verifier: 'debug',
      missingEvidence: ['diagnostic_evidence']
    });
  });

  it('passes when debug findings are grounded in collected diagnostics', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'debug' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.CDP_GET_CONSOLE_EVENTS,
          ok: true,
          code: 'OK',
          summary: 'Console events collected',
          data: {
            events: [{
              level: 'error',
              text: 'TypeError: Cannot read properties of undefined'
            }]
          }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: 'The page has a TypeError in the console.'
    })).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'debug'
    });
  });
});
