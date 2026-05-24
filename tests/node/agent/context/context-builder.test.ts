import { describe, expect, it } from 'vitest';

import { ContextBuilder } from '../../../../src/agent/context/context-builder';
import type { LoopTurn } from '../../../../src/agent/kernel/agent-step';

describe('context-builder', () => {
  it('builds model messages with task, goal and compact context', () => {
    const turns: LoopTurn[] = [
      {
        id: 't1',
        runId: 'run_1',
        stepIndex: 0,
        decision: {
          type: 'tool_call',
          tool: 'bh_mock_page_observe',
          args: {}
        },
        toolResult: {
          ok: true,
          code: 'OK',
          summary: 'Captured page summary'
        }
      }
    ];

    const builder = new ContextBuilder();
    const built = builder.build({
      task: 'Diagnose form issue',
      goal: 'Find root cause',
      successCriteria: ['Explain why submit is disabled'],
      turns,
      toolNames: ['bh_mock_page_observe']
    });

    expect(built.messages).toHaveLength(2);
    expect(built.messages[0]?.role).toBe('system');
    expect(built.messages[0]?.content).toContain('tool_call shape');
    expect(built.messages[0]?.content).toContain('Available tools:');
    expect(built.messages[0]?.content).toContain('bh_mock_page_observe');
    expect(built.messages[1]?.content).toContain('Diagnose form issue');
    expect(built.messages[1]?.content).toContain('Captured page summary');
    expect(built.compacted.steps).toHaveLength(1);
  });
});
