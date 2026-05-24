import type { AgentDecision } from '../../shared/schemas/agent-decision.schema';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';

export type LoopTurn = {
  id: string;
  runId: string;
  stepIndex: number;
  intent?: string;
  decision?: AgentDecision;
  toolResult?: ToolResult;
};

export function createLoopTurn(input: {
  runId: string;
  stepIndex: number;
  intent?: string;
}): LoopTurn {
  return {
    id: `${input.runId}_step_${input.stepIndex}`,
    runId: input.runId,
    stepIndex: input.stepIndex,
    ...(input.intent ? { intent: input.intent } : {})
  };
}
