import { describe, expect, it } from 'vitest';

import { adaptTraceEventsToReplayFrames } from '../../../../src/eval/replay/replay-event-adapter';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('adaptTraceEventsToReplayFrames', () => {
  it('extracts model output, parsed decision, tool args, tool result, and errors', () => {
    const frames = adaptTraceEventsToReplayFrames(trace());

    expect(frames.map((frame) => frame.kind)).toEqual([
      'model_output',
      'parsed_decision',
      'tool_call',
      'tool_result',
      'error'
    ]);
    expect(frames[0]?.payload).toMatchObject({ rawText: '{"type":"tool_call"}' });
    expect(frames[1]?.summary).toBe('Parsed decision: tool_call');
    expect(JSON.stringify(frames[2]?.payload)).toContain(TOOL_NAMES.PAGE_OBSERVE);
    expect(frames[3]?.errorCode).toBe('OK');
    expect(frames[4]?.errorCode).toBe('MODEL_OUTPUT_INVALID_JSON');
  });
});

function trace(): RuntimeEvent[] {
  return [
    {
      runId: 'run_1',
      timestamp: 1,
      type: TRACE_EVENT_NAMES.MODEL_OUTPUT_RECEIVED,
      payload: { rawText: '{"type":"tool_call"}' }
    },
    {
      runId: 'run_1',
      timestamp: 2,
      type: TRACE_EVENT_NAMES.MODEL_DECISION,
      payload: {
        decision: {
          type: 'tool_call',
          tool: TOOL_NAMES.PAGE_OBSERVE,
          args: {}
        }
      }
    },
    {
      runId: 'run_1',
      timestamp: 3,
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        args: {}
      }
    },
    {
      runId: 'run_1',
      timestamp: 4,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        ok: true,
        code: 'OK',
        summary: 'Observed page'
      }
    },
    {
      runId: 'run_1',
      timestamp: 5,
      type: TRACE_EVENT_NAMES.DECISION_PARSE_FAILED,
      payload: {
        rawText: '{',
        parseError: {
          code: 'MODEL_OUTPUT_INVALID_JSON',
          message: 'Invalid JSON'
        }
      }
    }
  ];
}

