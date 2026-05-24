import { describe, expect, it } from 'vitest';

import type { ModelClient } from '../../../../src/agent/model/ModelClient';

describe('ModelClient contract', () => {
  it('supports complete(input) -> { text } shape', async () => {
    const client: ModelClient = {
      async complete() {
        return {
          text: 'ok'
        };
      }
    };

    const result = await client.complete({
      runId: 'run_1',
      stepIndex: 0,
      messages: []
    });

    expect(result.text).toBe('ok');
  });
});
