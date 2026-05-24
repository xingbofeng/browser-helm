import type { ContextPolicy } from './context-policy';

export class ContextWindow {
  constructor(private readonly policy: ContextPolicy) {}

  enforce(contextText: string): string {
    if (contextText.length <= this.policy.maxTotalContextChars) {
      return contextText;
    }
    const max = this.policy.maxTotalContextChars;
    if (max <= 3) {
      return contextText.slice(0, max);
    }
    return `${contextText.slice(0, max - 3)}...`;
  }
}
