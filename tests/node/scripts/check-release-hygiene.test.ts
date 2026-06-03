import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const scriptPath = join(root, 'scripts/check-release-hygiene.ts');
const tsxBin = join(root, 'node_modules/.bin/tsx');

describe('check-release-hygiene script', () => {
  it('requires the v1.1-v1.6 completion matrix', () => {
    const cwd = createReleaseFixture();

    const result = runReleaseHygiene(cwd);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Missing v1.1-v1.6 completion matrix');
  });

  it('rejects a completion matrix that still marks P0 open', () => {
    const cwd = createReleaseFixture();
    writeCompletionMatrix(cwd, 'P0_GATE: open\nv1.1 v1.2 v1.3 v1.4 v1.5 v1.6\n');

    const result = runReleaseHygiene(cwd);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Completion matrix still marks P0 as open');
  });

  it('rejects forbidden directories nested inside build output', () => {
    const cwd = createReleaseFixture();
    writeCompletionMatrix(cwd);
    mkdirSync(join(cwd, '.output/chrome-mv3/.reasonix/truncated-results'), { recursive: true });
    writeFileSync(
      join(cwd, '.output/chrome-mv3/.reasonix/truncated-results/failing-test.txt'),
      'temporary failure log\n'
    );

    const result = runReleaseHygiene(cwd);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Forbidden file in build output');
    expect(result.stderr).toContain('.reasonix');
  });

  it('reports the controlled-beta release profile by default', () => {
    const cwd = createReleaseFixture();
    writeCompletionMatrix(cwd);

    const result = runReleaseHygiene(cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Release profile passed: controlled-beta');
  });

  it('rejects production profile without real-model verification evidence', () => {
    const cwd = createReleaseFixture();
    writeCompletionMatrix(cwd);

    const result = runReleaseHygiene(cwd, {
      BROWSER_HELM_RELEASE_PROFILE: 'production'
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Production profile requires real-model E2E verification');
  });
});

function runReleaseHygiene(
  cwd: string,
  env: Record<string, string> = {}
): { exitCode: number; stdout: string; stderr: string } {
  let stderr = '';
  let stdout: string;
  let exitCode = 0;
  try {
    stdout = execFileSync(tsxBin, [scriptPath], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const childError = error as { status?: number; stdout?: string; stderr?: string };
    exitCode = childError.status ?? 1;
    stdout = childError.stdout ?? '';
    stderr = childError.stderr ?? '';
  }
  return { exitCode, stdout, stderr };
}

function createReleaseFixture(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'browser-helm-release-hygiene-'));
  writeFileSync(
    join(cwd, '.gitignore'),
    [
      'node_modules/',
      '.wxt/',
      '.output/',
      'dist/',
      'test-results/',
      'artifacts/',
      'coverage/',
      'data/',
      '.env',
      '.env.*',
      '!.env.example',
      '.DS_Store',
      '.playwright-mcp/',
      '.playwright/',
      '.claude/',
      '.codex/',
      '.vercel',
      '.reasonix/',
      '*.jsonl',
      ''
    ].join('\n')
  );
  return cwd;
}

function writeCompletionMatrix(cwd: string, content = 'P0_GATE: closed\nv1.1 v1.2 v1.3 v1.4 v1.5 v1.6\n'): void {
  mkdirSync(join(cwd, 'docs/audits'), { recursive: true });
  writeFileSync(join(cwd, 'docs/audits/v1-1-v1-6-completion-matrix.md'), content);
}
