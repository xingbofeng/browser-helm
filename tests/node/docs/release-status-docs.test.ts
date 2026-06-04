import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const report = readFileSync(
  join(process.cwd(), 'docs/audits/v1-6-production-hardening-verification-report.md'),
  'utf8'
);

describe('release status documentation', () => {
  it('states controlled-beta or release-candidate status instead of default production readiness', () => {
    expect(report).toMatch(/controlled-beta|release candidate|RC/iu);
    expect(report).not.toContain('BrowserHelm v1.6 满足 **production release gate**');
    expect(report).toMatch(/production profile/iu);
    expect(report).toMatch(/real-sites \/ real-model 用例默认 skipped/u);
    expect(report).toContain('npm run test:e2e:real:model');
  });
});
