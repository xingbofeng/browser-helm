import type { ModelMessage } from '../../../shared/schemas/model-message.schema';
import { truncateJson } from '../../../shared/truncate-json';

const MAX_TOTAL_PROMPT_CHARS = 32000;
const MAX_USER_PROMPT_CHARS = 16000;
const PROMPT_BUDGET_MARGIN_CHARS = 1000;

export type ContextCompactorInput = {
  baseMessages: ModelMessage[];
  userContent: unknown;
};

export class ContextCompactor {
  compactUserContent(input: ContextCompactorInput): string {
    const baseOverhead = JSON.stringify(input.baseMessages).length;
    const availableUserBudget = MAX_TOTAL_PROMPT_CHARS - baseOverhead - PROMPT_BUDGET_MARGIN_CHARS;
    const userBudget = Math.max(
      100,
      Math.min(MAX_USER_PROMPT_CHARS, availableUserBudget)
    );
    return truncateJson(input.userContent, userBudget);
  }
}
