import { describe, expect, it } from 'vitest';

import vitestConfig from '../../../vitest.config';

const securityCriticalThresholds = [
  'src/background/runtime/run/security/authorization-service.ts',
  'src/background/runtime/run/approval/approval-coordinator.ts',
  'src/page/messaging/content-rpc-handler.ts',
  'src/tools/core/tool-registry.ts',
  'src/background/runtime/run/tools/approval/flows/workflow-replay-approval-flow.ts',
  'src/shared/redaction.ts'
] as const;

type CoverageThresholds = Record<string, unknown> & {
  statements?: number;
  branches?: number;
  functions?: number;
  lines?: number;
};

describe('coverage thresholds', () => {
  it('gates security-critical modules before raising global thresholds', () => {
    const config = vitestConfig as {
      test?: { coverage?: { thresholds?: CoverageThresholds } };
    };
    const thresholds = config.test?.coverage?.thresholds;

    expect(thresholds).toBeDefined();
    expect(thresholds?.statements).toBeLessThanOrEqual(35);
    expect(thresholds?.branches).toBeLessThanOrEqual(25);
    expect(thresholds?.functions).toBeLessThanOrEqual(30);
    expect(thresholds?.lines).toBeLessThanOrEqual(35);

    for (const file of securityCriticalThresholds) {
      const fileThreshold = thresholds?.[file] as CoverageThresholds | undefined;
      expect(typeof fileThreshold?.statements).toBe('number');
      expect(typeof fileThreshold?.branches).toBe('number');
      expect(typeof fileThreshold?.functions).toBe('number');
      expect(typeof fileThreshold?.lines).toBe('number');
    }
  });
});
