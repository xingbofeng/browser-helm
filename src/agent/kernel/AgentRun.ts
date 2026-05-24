import type { LoopSessionStatus } from './AgentState';
import type { TraceEvent } from '../../shared/schemas/trace.schema';

export type AgentRunInput = {
  task: string;
  goal?: string;
  successCriteria?: string[];
  maxSteps?: number;
};

export type AgentRunResult = {
  runId: string;
  status: LoopSessionStatus;
  message?: string;
  errorCode?: string;
  trace: TraceEvent[];
};

export function normalizeRunInput(input: AgentRunInput): Required<AgentRunInput> {
  return {
    task: input.task,
    goal: input.goal ?? input.task,
    successCriteria: input.successCriteria ?? [],
    maxSteps: input.maxSteps ?? 3
  };
}
