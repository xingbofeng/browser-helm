import { describe, expect, it } from 'vitest';

import { sanitizeMemoryText } from '../../../../src/agent/memory/memory-write-policy';

describe('memory write policy', () => {
  it('masks credentials and verification codes before memory storage', () => {
    const output = sanitizeMemoryText(
      'Login worked with password: hunter2 and otp=123456.'
    ).value;

    expect(output).not.toContain('hunter2');
    expect(output).not.toContain('123456');
    expect(output).toContain('password: [MASKED]');
    expect(output).toContain('otp: [MASKED]');
  });

  it('masks payment cards and Chinese citizen IDs', () => {
    const output = sanitizeMemoryText(
      'Do not keep 4111 1111 1111 1111 or 110105199003070019'
    ).value;

    expect(output).not.toContain('4111 1111 1111 1111');
    expect(output).not.toContain('110105199003070019');
    expect(output).toContain('[REDACTED_CARD]');
    expect(output).toContain('[REDACTED_ID]');
  });
});

