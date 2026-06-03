import { describe, expect, it } from 'vitest';

import { DOMAIN_ADAPTER_RUNTIME_CONTRACT } from '../../../src/adapters/adapter-types';

describe('domain adapter type contract', () => {
  it('keeps DomainAdapter as non-executing site guidance with explicit runtime requirements', () => {
    expect(DOMAIN_ADAPTER_RUNTIME_CONTRACT).toEqual({
      productConcept: 'DomainAdapter',
      executionModel: 'non_executing_hints',
      genericFallback: 'generic_browser_tools',
      approvalPolicy: 'global_policy_always_enforced',
      requiredRuntimeBehaviors: [
        'versioning',
        'locator_verification',
        'drift_detection',
        'failure_reporting',
        'policy_composition'
      ]
    });
  });
});
