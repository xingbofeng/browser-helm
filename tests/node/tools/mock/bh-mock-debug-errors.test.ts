import { describe, expect, it } from 'vitest';

import { bhMockDebugErrors } from '../../../helpers/tools/bh-mock-debug-errors';

describe('bhMockDebugErrors', () => {
  it('returns mock debug findings', async () => {
    const result = await bhMockDebugErrors.execute(
      {
        page: 'current'
      },
      {
        runId: 'run_1',
        stepId: 'step_3'
      }
    );

    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    expect(result.summary).toContain('debug');
  });
});
