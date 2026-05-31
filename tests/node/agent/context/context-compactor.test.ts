import { describe, expect, it } from 'vitest';

import { ContextCompactor } from '../../../../src/agent/context/context-compactor';
import type { LoopTurn } from '../../../../src/agent/context/loop-turn';

describe('context-compactor', () => {
  it('keeps only latest summaries according to maxRecentSteps', () => {
    const turns = buildTurns(5);
    const compactor = new ContextCompactor({
      maxRecentSteps: 3,
      maxToolResultChars: 1200,
      maxTotalContextChars: 8000
    });

    const compacted = compactor.compact(turns);

    expect(compacted.steps).toHaveLength(3);
    expect(compacted.steps[0]?.stepIndex).toBe(2);
    expect(compacted.steps[2]?.stepIndex).toBe(4);
  });

  it('never injects full toolResult.data into compact context', () => {
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
          summary: 'Captured elements',
          data: {
            secretLargePayload: 'x'.repeat(500)
          },
          nextHints: ['Continue']
        }
      }
    ];

    const compactor = new ContextCompactor({
      maxRecentSteps: 3,
      maxToolResultChars: 1200,
      maxTotalContextChars: 8000
    });

    const compacted = compactor.compact(turns);

    expect(compacted.contextText).toContain('Captured elements');
    expect(compacted.contextText).not.toContain('secretLargePayload');
  });

  it('respects maxTotalContextChars', () => {
    const turns = buildTurns(4, 'very-long-summary-'.repeat(200));
    const compactor = new ContextCompactor({
      maxRecentSteps: 4,
      maxToolResultChars: 1200,
      maxTotalContextChars: 300
    });

    const compacted = compactor.compact(turns);

    expect(compacted.totalChars).toBeLessThanOrEqual(300);
    expect(compacted.contextText.length).toBeLessThanOrEqual(300);
  });

  it('uses context.summary when visibility is summary', () => {
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
          summary: 'full verbose summary',
          context: {
            visibility: 'summary',
            summary: 'compact summary'
          }
        }
      }
    ];

    const compactor = new ContextCompactor();
    const compacted = compactor.compact(turns);

    expect(compacted.contextText).toContain('compact summary');
    expect(compacted.contextText).not.toContain('full verbose summary');
  });

  it('hides tool summary when visibility is hidden', () => {
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
          summary: 'sensitive summary',
          context: {
            visibility: 'hidden'
          }
        }
      }
    ];

    const compactor = new ContextCompactor();
    const compacted = compactor.compact(turns);

    expect(compacted.contextText).toContain('summary=[hidden]');
    expect(compacted.contextText).not.toContain('sensitive summary');
  });

  it('allows explicit full visibility to include data within policy limits', () => {
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
          summary: 'short summary',
          data: {
            visibleField: 'visible value'
          },
          context: {
            visibility: 'full'
          }
        }
      }
    ];

    const compactor = new ContextCompactor();
    const compacted = compactor.compact(turns);

    expect(compacted.contextText).toContain('visibleField');
    expect(compacted.contextText).toContain('visible value');
  });

  it('does not include full data for approval-required results', () => {
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
          ok: false,
          code: 'APPROVAL_REQUIRED',
          summary: 'needs approval',
          data: {
            sensitiveField: 'sensitive value'
          },
          requiresApproval: true,
          context: {
            visibility: 'full'
          }
        }
      }
    ];

    const compactor = new ContextCompactor();
    const compacted = compactor.compact(turns);

    expect(compacted.contextText).toContain('needs approval');
    expect(compacted.contextText).not.toContain('sensitiveField');
  });
});

function buildTurns(count: number, summaryPrefix = 'step-summary'): LoopTurn[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `t${index}`,
    runId: 'run_1',
    stepIndex: index,
    decision: {
      type: 'tool_call',
      tool: 'bh_mock_page_observe',
      args: {}
    },
    toolResult: {
      ok: true,
      code: 'OK',
      summary: `${summaryPrefix}-${index}`,
      nextHints: ['Continue']
    }
  }));
}
