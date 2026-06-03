import { describe, expect, it } from 'vitest';

import { buildTraceReplaySeed } from '../../../../src/eval/replay/trace-replay-seed';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('buildTraceReplaySeed', () => {
  it('builds a sanitized replay seed with model, repair, decision, tool, result, and manifest evidence', () => {
    const seed = buildTraceReplaySeed({
      runId: 'run_1',
      toolManifestHash: 'manifest_hash_1',
      events: trace()
    });

    expect(seed).toMatchObject({
      runId: 'run_1',
      toolManifestHash: 'manifest_hash_1'
    });
    expect(seed.modelOutputs[0]?.timestamp).toBe(1);
    expect(seed.modelOutputs[0]?.rawText).toContain('tool_call');
    expect(seed.parseRepairs[0]).toMatchObject({
      timestamp: 2,
      errorCode: 'MODEL_OUTPUT_INVALID_JSON',
      repairAttempt: 0
    });
    expect(seed.parsedDecisions[0]).toMatchObject({
      timestamp: 3,
      decision: {
        type: 'tool_call',
        tool: TOOL_NAMES.PAGE_OBSERVE
      }
    });
    expect(seed.toolCalls[0]).toMatchObject({
      timestamp: 4,
      tool: TOOL_NAMES.PAGE_OBSERVE
    });
    expect(seed.toolResults[0]).toMatchObject({
      timestamp: 5,
      tool: TOOL_NAMES.PAGE_OBSERVE,
      code: 'OK',
      summary: 'Observed dashboard'
    });
    expect(seed.errors[0]).toMatchObject({
      timestamp: 6,
      errorCode: 'TOOL_EXECUTION_FAILED'
    });

    const serialized = JSON.stringify(seed);
    expect(serialized).not.toContain('sk-live-secret');
    expect(serialized).not.toContain('data:image/png');
    expect(serialized).not.toContain('raw clipboard draft');
    expect(serialized).not.toContain('4111111111111111');
    expect(serialized).not.toContain('hunter2');
  });
});

function trace(): RuntimeEvent[] {
  return [
    {
      runId: 'run_1',
      timestamp: 1,
      type: TRACE_EVENT_NAMES.MODEL_OUTPUT_RECEIVED,
      payload: {
        rawText: '{"type":"tool_call","tool":"bh_page_observe","apiKey":"sk-live-secret"}'
      }
    },
    {
      runId: 'run_1',
      timestamp: 2,
      type: TRACE_EVENT_NAMES.DECISION_PARSE_FAILED,
      payload: {
        rawText: '{"type":"tool_call"',
        repairAttempt: 0,
        parseError: {
          code: 'MODEL_OUTPUT_INVALID_JSON',
          message: 'Invalid JSON with token=sk-live-secret'
        }
      }
    },
    {
      runId: 'run_1',
      timestamp: 3,
      type: TRACE_EVENT_NAMES.MODEL_DECISION,
      payload: {
        decision: {
          type: 'tool_call',
          tool: TOOL_NAMES.PAGE_OBSERVE,
          args: {
            actualValue: '4111111111111111'
          }
        }
      }
    },
    {
      runId: 'run_1',
      timestamp: 4,
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        argsPreview: {
          clipboardText: 'raw clipboard draft',
          password: 'hunter2'
        }
      }
    },
    {
      runId: 'run_1',
      timestamp: 5,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        result: {
          ok: true,
          code: 'OK',
          summary: 'Observed dashboard',
          data: {
            dataUrl: 'data:image/png;base64,abcdef'
          }
        }
      }
    },
    {
      runId: 'run_1',
      timestamp: 6,
      type: TRACE_EVENT_NAMES.TOOL_FAILED,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        code: 'TOOL_EXECUTION_FAILED',
        message: 'Tool failed with api_key=sk-live-secret'
      }
    }
  ];
}
