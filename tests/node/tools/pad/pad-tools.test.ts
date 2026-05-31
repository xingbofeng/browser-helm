import { describe, expect, it } from 'vitest';

import { bhPadAppend, bhPadClear, bhPadCompact, bhPadRead } from '../../../../src/tools/pad/bh-pad-tools';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';

const rpc: ContentRpcClient = {
  request: async () => ({
    ok: false,
    code: 'UNUSED',
    message: 'unused'
  })
};

describe('scratchpad tools', () => {
  it('writes, reads, compacts, and clears run scratchpad', async () => {
    const ctx = { runId: `run_pad_${Date.now()}`, stepId: 'step_1', runMode: 'ask' as const };

    await bhPadAppend(rpc).execute({ text: 'First fact' }, ctx);
    await bhPadAppend(rpc).execute({ text: 'Second fact' }, ctx);

    const read = await bhPadRead(rpc).execute({}, ctx);
    expect(readData<{ content: string }>(read).content).toContain('First fact');

    const compacted = await bhPadCompact(rpc).execute({ maxChars: 6 }, ctx);
    expect(readData<{ content: string }>(compacted).content).toBe('d fact');

    const cleared = await bhPadClear(rpc).execute({}, ctx);
    expect(readData<{ content: string }>(cleared).content).toBe('');
  });
});

function readData<T>(value: { data?: unknown }): T {
  return value.data as T;
}

