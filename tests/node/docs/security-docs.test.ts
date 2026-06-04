import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const securityDoc = readFileSync(join(process.cwd(), 'docs/security.md'), 'utf8');

describe('security documentation', () => {
  it('documents session-only provider API key storage as the default', () => {
    expect(securityDoc).toMatch(/API keys.*session storage|session-only/iu);
    expect(securityDoc).toMatch(/local persistence.*trusted|trusted.*local persistence/iu);
    expect(securityDoc).not.toMatch(/API keys are stored in `chrome\.storage\.local`/u);
  });
});
