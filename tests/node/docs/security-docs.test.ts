import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const securityDoc = readFileSync(join(process.cwd(), 'docs/security.md'), 'utf8');

describe('security documentation', () => {
  it('documents trusted local provider API key storage as the default with a session-only option', () => {
    expect(securityDoc).toMatch(/trusted local storage.*default|default.*trusted local storage/iu);
    expect(securityDoc).toMatch(/session-only|current browser session/iu);
    expect(securityDoc).toMatch(/unencrypted on disk/iu);
  });
});
