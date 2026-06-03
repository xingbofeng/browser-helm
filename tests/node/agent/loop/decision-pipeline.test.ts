import { describe, expect, it } from 'vitest';
import { DecisionPipeline } from '../../../../src/agent/loop/decision-pipeline';
import type { RunRecord } from '../../../../src/agent/loop/types';
import type { RunSnapshot } from '../../../../src/runtime/runtime-messages';

describe('DecisionPipeline', () => {
  it('parses model output and rejects unavailable tool calls', () => {
    const record: RunRecord = {
      task: '点击按钮',
      mode: 'ask',
      trace: []
    };
    const snapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'thinking',
      trace: [],
      streaming: { enabled: false, active: false, chunkCount: 0, fallbackUsed: false }
    } as RunSnapshot;

    const result = new DecisionPipeline().evaluate({
      outputText: '{"type":"tool_call","tool":"bh_action_click","args":{},"reason":"click"}',
      toolsContracts: [],
      snapshot,
      record
    });

    expect(result).toMatchObject({
      ok: false,
      parsed: true,
      error: {
        kind: 'tool_not_found'
      }
    });
  });
});
