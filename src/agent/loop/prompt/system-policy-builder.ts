import type { ModelMessage } from '../../../shared/schemas/model-message.schema';
import type { RunMode } from '../../../shared/schemas/tool.schema';
import type { ToolPromptContract } from '../../../tools/core/tool-router';
import type { Locale } from '../../../i18n/types';
import { buildStablePolicyPrefix } from '../../prompts/safety-policy-prompt';

export type SystemPolicyBuilderInput = {
  mode: RunMode;
  toolsContracts: ToolPromptContract[];
  locale: Locale;
};

export class SystemPolicyBuilder {
  build(input: SystemPolicyBuilderInput): ModelMessage {
    return {
      role: 'system',
      content: buildStablePolicyPrefix(input)
    };
  }
}
