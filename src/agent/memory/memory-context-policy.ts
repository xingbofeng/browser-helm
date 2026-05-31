export type MemoryContextPolicy = {
  maxMemoryHits: number;
  maxWorkflowHits: number;
  maxScratchpadChars: number;
  maxSummaryChars: number;
};

export const DEFAULT_MEMORY_CONTEXT_POLICY: MemoryContextPolicy = {
  maxMemoryHits: 5,
  maxWorkflowHits: 3,
  maxScratchpadChars: 1600,
  maxSummaryChars: 600
};

