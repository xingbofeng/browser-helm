import type { AgentRunInput } from './agent-run';
import type { LoopTurn } from './agent-step';

export type AgentContext = {
  runId: string;
  task: string;
  goal?: string;
  successCriteria?: string[];
  maxSteps?: number;
  turns: LoopTurn[];
};

export function createAgentContext(
  runId: string,
  input: AgentRunInput
): AgentContext {
  return {
    runId,
    task: input.task,
    ...(input.goal ? { goal: input.goal } : {}),
    ...(input.successCriteria ? { successCriteria: input.successCriteria } : {}),
    ...(typeof input.maxSteps === 'number' ? { maxSteps: input.maxSteps } : {}),
    turns: []
  };
}

export function appendTurn(context: AgentContext, turn: LoopTurn): AgentContext {
  return {
    ...context,
    turns: [...context.turns, turn]
  };
}
