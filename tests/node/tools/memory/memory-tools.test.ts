import { describe, expect, it } from 'vitest';

import { bhMemoryClearAll, bhMemoryDelete, bhMemoryList, bhMemoryLookup, bhMemorySave } from '../../../../src/tools/memory/bh-memory-tools';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';

const rpc: ContentRpcClient = {
  request: async () => ({
    ok: false,
    code: 'UNUSED',
    message: 'unused'
  })
};

const ctx = { runId: 'run_memory_tools', stepId: 'step_1', runMode: 'ask' as const };

describe('memory tools', () => {
  it('saves, looks up, lists, and deletes memory entries', async () => {
    await bhMemoryClearAll(rpc).execute({}, ctx);

    const saved = await bhMemorySave(rpc).execute({
      domain: 'app.example.com',
      task: 'Open invoice report',
      summary: 'Use Billing > Invoices'
    }, ctx);

    expect(saved.ok).toBe(true);
    const id = readData<{ entry: { id: string } }>(saved).entry.id;

    const lookup = await bhMemoryLookup(rpc).execute({
      domain: 'app.example.com',
      query: 'invoice'
    }, ctx);
    expect(readData<{ hits: unknown[] }>(lookup).hits).toHaveLength(1);

    const listed = await bhMemoryList(rpc).execute({ domain: 'app.example.com' }, ctx);
    expect(readData<{ entries: unknown[] }>(listed).entries).toHaveLength(1);

    const deleted = await bhMemoryDelete(rpc).execute({ id }, ctx);
    expect(readData<{ deleted: boolean }>(deleted).deleted).toBe(true);
  });
});

function readData<T>(value: { data?: unknown }): T {
  return value.data as T;
}

