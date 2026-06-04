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

  it('includes release hygiene in the release check gate', () => {
    expect(packageJson.scripts?.['check:release']).toContain('npm run check:release-hygiene');
  });

  it('includes manifest permission audit in the release check gate', () => {
    expect(packageJson.scripts?.['check:release']).toContain('npm run check:manifest-permissions');
  });

  it('includes security regression suite in the release check gate', () => {
    expect(packageJson.scripts?.['check:release']).toContain('npm run test:security');
  });
});
