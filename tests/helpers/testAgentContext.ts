import type { AgentRunInput } from '../../src/agent/kernel/AgentRun';
import type { LoopTurn } from '../../src/agent/kernel/AgentStep';

export function createTestRunInput(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
  return {
    task: 'Test task',
    maxSteps: 3,
    ...overrides
  };
}

export function createTestTurns(count: number): LoopTurn[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `turn_${index}`,
    runId: 'run_test',
    stepIndex: index,
    decision: {
      type: 'tool_call',
      tool: 'bh_mock_page_observe',
      args: {}
    },
    toolResult: {
      ok: true,
      code: 'OK',
      summary: `summary-${index}`
    }
  }));
}
