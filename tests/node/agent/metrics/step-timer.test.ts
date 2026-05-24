import { describe, expect, it } from 'vitest';

import { StepTimer } from '../../../../src/agent/metrics/step-timer';

describe('StepTimer', () => {
  it('measures step duration', async () => {
    const timer = new StepTimer();
    const startedAt = timer.start();
    await new Promise((resolve) => setTimeout(resolve, 1));
    const result = timer.stop(startedAt);

    expect(result.endedAt).toBeGreaterThanOrEqual(result.startedAt);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
