import type { LoopTurn } from './loop-turn';
import { DEFAULT_CONTEXT_POLICY, type ContextPolicy } from './context-policy';

export type CompactedStep = {
  stepIndex: number;
  summary: string;
};

export type CompactedContext = {
  steps: CompactedStep[];
  contextText: string;
  totalChars: number;
  policy: ContextPolicy;
};

export class ContextCompactor {
  constructor(private readonly policy: ContextPolicy = DEFAULT_CONTEXT_POLICY) {}

  compact(turns: LoopTurn[]): CompactedContext {
    const recentTurns = turns.slice(-this.policy.maxRecentSteps);
    const steps = recentTurns.map((turn) => ({
      stepIndex: turn.stepIndex,
      summary: compactTurnSummary(turn, this.policy.maxToolResultChars)
    }));

    let contextText = steps
      .map((step) => `step=${step.stepIndex} ${step.summary}`)
      .join('\n');
    if (contextText.length > this.policy.maxTotalContextChars) {
      contextText = truncateText(contextText, this.policy.maxTotalContextChars);
    }

    return {
      steps,
      contextText,
      totalChars: contextText.length,
      policy: this.policy
    };
  }
}

function compactTurnSummary(turn: LoopTurn, maxChars: number): string {
  const tool = turn.decision?.type === 'tool_call' ? turn.decision.tool : 'none';
  const result = turn.toolResult;
  if (!result) {
    return truncateText(`tool=${tool} result=none`, maxChars);
  }

  const summary = resolveSummaryForContext(result);

  const hints =
    result.nextHints && result.nextHints.length > 0
      ? ` hints=${result.nextHints.join('|')}`
      : '';
  const changedPage =
    typeof result.changedPage === 'boolean'
      ? ` changedPage=${String(result.changedPage)}`
      : '';
  const requiresObserve =
    typeof result.requiresObserve === 'boolean'
      ? ` requiresObserve=${String(result.requiresObserve)}`
      : '';
  const requiresApproval =
    typeof result.requiresApproval === 'boolean'
      ? ` requiresApproval=${String(result.requiresApproval)}`
      : '';

  // Deliberately excludes result.data to prevent context bloat/leakage.
  const base = `tool=${tool} code=${result.code} summary=${summary}${hints}${changedPage}${requiresObserve}${requiresApproval}`;
  return truncateText(base, maxChars);
}

function resolveSummaryForContext(result: NonNullable<LoopTurn['toolResult']>): string {
  const context = result.context;
  const visibility = context?.visibility;
  if (visibility === 'hidden') {
    return '[hidden]';
  }
  if (visibility === 'summary') {
    return context?.summary ?? result.summary;
  }
  if (visibility === 'full') {
    if (result.requiresApproval === true) {
      return context?.summary ?? result.summary;
    }
    return context?.summary ?? serializeFullContext(result.data) ?? result.summary;
  }
  return result.summary;
}

function serializeFullContext(data: unknown): string | undefined {
  if (data === undefined) {
    return undefined;
  }
  if (typeof data === 'string') {
    return data;
  }
  return JSON.stringify(data);
}

function truncateText(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  if (maxChars <= 3) {
    return input.slice(0, maxChars);
  }
  return `${input.slice(0, maxChars - 3)}...`;
}
