import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
) as {
  scripts?: Record<string, string>;
};

describe('package scripts', () => {
  it('provides an opt-in pre-push hook installer for local preflight', () => {
    expect(packageJson.scripts?.['setup:pre-push']).toBe('tsx scripts/setup-pre-push-hook.ts');
  });
});
