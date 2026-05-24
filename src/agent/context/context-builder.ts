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

export type BuildContextInput = {
  task: string;
  goal?: string;
  successCriteria?: string[];
  turns: LoopTurn[];
  toolNames?: string[];
  tools?: ToolPromptContract[];
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
      compacted.contextText ? `RecentSteps:\n${compacted.contextText}` : undefined
    ].filter((line): line is string => typeof line === 'string');

    return {
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(input.tools ?? input.toolNames ?? [])
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
