import { describe, expect, it } from 'vitest';

import { readTraceReplayJsonl } from '../../../../src/eval/replay/trace-replay-reader';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('readTraceReplayJsonl', () => {
  it('reads valid JSONL trace events and adapts replay frames', () => {
    const result = readTraceReplayJsonl([
      JSON.stringify({
        runId: 'run_1',
        timestamp: 1,
        type: TRACE_EVENT_NAMES.MODEL_OUTPUT_RECEIVED,
        payload: { rawText: '{"type":"tool_call"}' }
      }),
      JSON.stringify({
        runId: 'run_1',
        timestamp: 2,
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        payload: { tool: TOOL_NAMES.PAGE_OBSERVE, args: {} }
      }),
      '{bad-json',
      JSON.stringify({
        runId: 'run_1',
        timestamp: 3,
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Observed page'
        }
      })
    ].join('\n'));

    expect(result.events).toHaveLength(3);
    expect(result.skippedLines).toBe(1);
    expect(result.frames.map((frame) => frame.kind)).toEqual([
      'model_output',
      'tool_call',
      'tool_result'
    ]);
  });
});

