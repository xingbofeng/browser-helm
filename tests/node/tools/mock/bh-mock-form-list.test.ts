import { describe, expect, it } from 'vitest';

import { bhMockFormList } from '../../../helpers/tools/bh-mock-form-list';

describe('bhMockFormList', () => {
  it('returns mock form fields', async () => {
    const result = await bhMockFormList.execute(
      {
        scope: 'current'
      },
      {
        runId: 'run_1',
        stepId: 'step_2'
      }
    );

    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    expect(Array.isArray(result.data)).toBe(true);
  });
});
