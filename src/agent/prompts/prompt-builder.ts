import { buildSystemPrompt } from './system-prompt';
import type { ToolPromptContract } from '../../tools/core/tool-router';

export class PromptBuilder {
  buildSystemPrompt(tools: Array<string | ToolPromptContract>): string {
    return buildSystemPrompt(tools);
  }
}
