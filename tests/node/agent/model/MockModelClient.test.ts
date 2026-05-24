import { describe, expect, it } from 'vitest';

import { MockModelClient } from '../../../../src/agent/model/MockModelClient';

describe('MockModelClient', () => {
  it('returns queued outputs in order', async () => {
    const client = new MockModelClient(['one', 'two']);

    const first = await client.complete({
      runId: 'run_1',
      stepIndex: 0,
      messages: []
    });
    const second = await client.complete({
      runId: 'run_1',
      stepIndex: 1,
      messages: []
    });

    expect(first.text).toBe('one');
    expect(second.text).toBe('two');
  });
});
