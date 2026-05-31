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
