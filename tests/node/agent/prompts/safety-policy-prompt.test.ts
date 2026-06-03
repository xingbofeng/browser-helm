import { describe, expect, it } from 'vitest';

import { buildStablePolicyPrefix } from '../../../../src/agent/prompts/safety-policy-prompt';

describe('buildStablePolicyPrefix', () => {
  it('states that full mode never bypasses high-risk approval', () => {
    const prompt = buildStablePolicyPrefix({
      mode: 'full',
      locale: 'en',
      toolsContracts: []
    });

    expect(prompt).toContain('Full mode');
    expect(prompt).toContain('does not bypass approval');
    expect(prompt).not.toContain('without approval interception');
    expect(prompt).not.toContain('does not intercept high-risk tools');
  });
});
