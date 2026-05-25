import type { LoopTurn } from '../kernel/agent-step';
import { ContextCompactor } from './context-compactor';
import {
  DEFAULT_CONTEXT_POLICY,
  type ContextPolicy
} from './context-policy';
import type { CompactedContext } from './context-compactor';
import type { ModelMessage } from '../../shared/schemas/model-message.schema';
import { buildSystemPrompt } from '../prompts/system-prompt';
import type { ToolPromptContract } from '../../tools/core/tool-router';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { TaskClassification } from '../../shared/schemas/mode-system.schema';
import type { PlanProgressSummary } from '../../shared/schemas/goal-plan.schema';

export type BuildContextInput = {
  task: string;
  goal?: string;
  successCriteria?: string[];
  turns: LoopTurn[];
  toolNames?: string[];
  tools?: ToolPromptContract[];
  runMode?: RunMode;
  modeReason?: string;
  classification?: TaskClassification;
  planProgress?: PlanProgressSummary;
  reportSummary?: string;
};

export type BuiltContext = {
  messages: ModelMessage[];
  compacted: CompactedContext;
};

export class ContextBuilder {
  private readonly compactor: ContextCompactor;

  constructor(policy: ContextPolicy = DEFAULT_CONTEXT_POLICY) {
    this.compactor = new ContextCompactor(policy);
  }

  build(input: BuildContextInput): BuiltContext {
    const compacted = this.compactor.compact(input.turns);

    const taskLines = [
      `Task: ${input.task}`,
      input.goal ? `Goal: ${input.goal}` : undefined,
      input.successCriteria && input.successCriteria.length > 0
        ? `SuccessCriteria: ${input.successCriteria.join(' | ')}`
        : undefined,
      input.modeReason ? `ModeReason: ${input.modeReason}` : undefined,
      input.classification
        ? `Classification: ${input.classification.mode} (${input.classification.confidence}) - ${input.classification.reason}`
        : undefined,
      input.planProgress
        ? `PlanProgress: done=${input.planProgress.done.join(', ') || 'none'}; current=${input.planProgress.current ?? 'none'}; pending=${input.planProgress.pending.join(', ') || 'none'}`
        : undefined,
      input.reportSummary ? `ReportSummary: ${input.reportSummary}` : undefined,
      compacted.contextText ? `RecentSteps:\n${compacted.contextText}` : undefined
    ].filter((line): line is string => typeof line === 'string');

    return {
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(input.tools ?? input.toolNames ?? [], input.runMode)
        },
        {
          role: 'user',
          content: taskLines.join('\n')
        }
      ],
      compacted
    };
  }
}
