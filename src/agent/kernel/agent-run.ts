import type { LoopSessionStatus } from './agent-state';
import type { Locale } from '../../i18n/types';
import type { TraceEvent } from '../../shared/schemas/trace.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';

export type AgentRunInput = {
  locale?: Locale;
  task: string;
  goal?: string;
  successCriteria?: string[];
  maxSteps?: number;
  mode?: RunMode;
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
    locale: input.locale ?? 'zh',
    task: input.task,
    goal: input.goal ?? input.task,
    successCriteria: input.successCriteria ?? [],
    maxSteps: input.maxSteps ?? 3,
    mode: input.mode ?? 'ask'
  };
}
