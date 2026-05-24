import { describe, expect, it } from 'vitest';

import { maskSecrets } from '../../../../src/agent/policy/masking';

describe('maskSecrets', () => {
  it('masks Bearer token values', () => {
    const input = 'Authorization: Bearer sk-abc123';
    const output = maskSecrets(input);

    expect(output).not.toContain('sk-abc123');
    expect(output).toContain('[MASKED]');
  });

  it('masks OPENAI_API_KEY-like entries', () => {
    const input = 'OPENAI_API_KEY=sk-secret-key';
    const output = maskSecrets(input);

    expect(output).toContain('OPENAI_API_KEY=');
    expect(output).not.toContain('sk-secret-key');
  });
});
