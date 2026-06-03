import type { ModelMessage } from '../../../shared/schemas/model-message.schema';
import { ContextCompactor } from './context-compactor';

export type DynamicContextBuilderInput = {
  baseMessages: ModelMessage[];
  userContent: unknown;
  decisionGuidance?: string | undefined;
};

export class DynamicContextBuilder {
  constructor(private readonly compactor = new ContextCompactor()) {}

  buildUserMessage(input: DynamicContextBuilderInput): ModelMessage {
    const userJson = this.compactor.compactUserContent({
      baseMessages: input.baseMessages,
      userContent: input.userContent
    });
    return {
      role: 'user',
      content: input.decisionGuidance
        ? `RUNTIME_DECISION_GUIDANCE: ${input.decisionGuidance}\n${userJson}`
        : userJson
    };
  }
}
