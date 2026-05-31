import { describe, expect, it } from 'vitest';

import { scratchpadEntrySchema, scratchpadSummarySchema } from '../../../../src/shared/schemas/scratchpad';

describe('scratchpad schemas', () => {
  it('validates current-run scratchpad entries and summaries', () => {
    expect(scratchpadEntrySchema.parse({
      runId: 'run_1',
      content: 'Step one complete',
      createdAt: 1,
      updatedAt: 2
    }).content).toBe('Step one complete');

    expect(scratchpadSummarySchema.parse({
      runId: 'run_1',
      content: 'Step one complete',
      charCount: 17
    }).charCount).toBe(17);
  });
});

