export type ContextPolicy = {
  maxRecentSteps: number;
  maxToolResultChars: number;
  maxTotalContextChars: number;
};

export const DEFAULT_CONTEXT_POLICY: ContextPolicy = {
  maxRecentSteps: 3,
  maxToolResultChars: 1200,
  maxTotalContextChars: 8000
};
