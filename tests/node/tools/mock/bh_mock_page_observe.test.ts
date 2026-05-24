import { describe, expect, it } from 'vitest';

import { bhMockPageObserve } from '../../../../src/tools/mock/bh_mock_page_observe';

describe('bhMockPageObserve', () => {
  it('returns a successful observation result', async () => {
    const result = await bhMockPageObserve.execute(
      {
        page: 'current'
      },
      {
        runId: 'run_1',
        stepId: 'step_1'
      }
    );

    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
