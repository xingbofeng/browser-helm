import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
) as {
  scripts?: Record<string, string>;
};

const requiredSecurityRegressionFiles = [
  'tests/node/runtime/run/security/prompt-injection-mutation.test.ts',
  'tests/node/runtime/run/tools/tool-runtime-policy.test.ts',
  'tests/node/runtime/run/tools/tool-execution-service.test.ts',
  'tests/dom/page/messaging/content-rpc-handler.test.ts',
  'tests/node/runtime/run/approval/approval-coordinator.test.ts',
  'tests/node/runtime/run/security/authorization-service.test.ts',
  'tests/dom/ui/streaming-markdown.test.tsx',
  'tests/node/entrypoints/content-page-health.test.ts',
  'tests/node/storage/memory-repo.test.ts',
  'tests/node/storage/chrome-settings-store.test.ts',
  'tests/node/runtime/run/workflow-replay-approval-flow.test.ts',
  'tests/node/runtime/run/prompt-builder.test.ts'
] as const;

const requiredSecurityE2eFiles = [
  'tests/e2e/specs/extension/security/prompt-injection-security.spec.ts'
] as const;

describe('security regression suite', () => {
  it('exposes one npm script that runs the security-critical regression files', () => {
    const script = packageJson.scripts?.['test:security'];

    expect(script).toBeDefined();
    expect(script).toContain('vitest run');

    for (const testFile of requiredSecurityRegressionFiles) {
      expect(existsSync(resolve(process.cwd(), testFile))).toBe(true);
      expect(script).toContain(testFile);
    }

    expect(script).toContain('playwright test tests/e2e/specs/extension/security');
    for (const testFile of requiredSecurityE2eFiles) {
      expect(existsSync(resolve(process.cwd(), testFile))).toBe(true);
    }
  });
});
