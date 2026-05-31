import { describe, expect, it } from 'vitest';

import { memoryEntrySchema, memoryHitSchema, memorySummarySchema } from '../../../../src/shared/schemas/memory';

describe('memory schemas', () => {
  it('defaults memory kind, counters, tags, and masked flag', () => {
    const parsed = memoryEntrySchema.parse({
      id: 'mem_1',
      domain: 'example.com',
      task: 'Open report',
      summary: 'Report page uses the sidebar',
      createdAt: 1,
      updatedAt: 1
    });

    expect(parsed.kind).toBe('domain_fact');
    expect(parsed.successCount).toBe(0);
    expect(parsed.failureCount).toBe(0);
    expect(parsed.tags).toEqual([]);
    expect(parsed.masked).toBe(true);
  });

  it('validates scored hits and prompt summaries', () => {
    const hit = memoryHitSchema.parse({
      id: 'mem_2',
      domain: 'example.com',
      task: 'Find invoice',
      summary: 'Invoices live under Billing',
      createdAt: 1,
      updatedAt: 1,
      score: 1
    });

    expect(memorySummarySchema.parse({
      domain: 'example.com',
      hits: [hit],
      summary: '1 reusable memory hit'
    }).hits).toHaveLength(1);
  });
});

