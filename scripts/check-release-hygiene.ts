/**
 * Checks that no sensitive or temporary files would leak into a release.
 *
 * Usage: npx tsx scripts/check-release-hygiene.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const COMPLETION_MATRIX_PATH = 'docs/audits/v1-1-v1-6-completion-matrix.md';
const REQUIRED_COMPLETION_MATRIX_VERSIONS = ['v1.1', 'v1.2', 'v1.3', 'v1.4', 'v1.5', 'v1.6'];
const RELEASE_PROFILES = ['internal-alpha', 'controlled-beta', 'production'] as const;
type ReleaseProfile = typeof RELEASE_PROFILES[number];
const releaseProfile = parseReleaseProfile(process.env.BROWSER_HELM_RELEASE_PROFILE);

// ── Patterns that must be gitignored ──
const GITIGNORE_PATTERNS = [
  '.reasonix/',
  '.env',
  '*.jsonl',
  'test-results/',
  'artifacts/',
];

// ── Patterns that must NOT appear in tracked files ──
const FORBIDDEN_TRACKED = [
  { pattern: /^\.reasonix\//, label: '.reasonix/' },
  { pattern: /\.env$/, label: '.env files', exclude: '.env.example' },
  { pattern: /\.jsonl$/, label: 'trace JSONL' },
  { pattern: /^test-results\//, label: 'test-results/' },
  { pattern: /^artifacts\//, label: 'artifacts/' },
];

// ── Patterns that must NOT exist on disk ──
const FORBIDDEN_ON_DISK = [
  '.reasonix',
  '.env',
  '*.jsonl',
  'test-results',
  'artifacts',
];

// ── Check .gitignore ──
const gitignore = readFileSync(resolve(ROOT, '.gitignore'), 'utf8');

let hasError = false;

// ── Check v1.1-v1.6 completion matrix release gate ──
const completionMatrixPath = resolve(ROOT, COMPLETION_MATRIX_PATH);
if (!existsSync(completionMatrixPath)) {
  console.error(`❌ Missing v1.1-v1.6 completion matrix: ${COMPLETION_MATRIX_PATH}`);
  hasError = true;
} else {
  const completionMatrix = readFileSync(completionMatrixPath, 'utf8');
  for (const version of REQUIRED_COMPLETION_MATRIX_VERSIONS) {
    if (!completionMatrix.includes(version)) {
      console.error(`❌ Completion matrix missing roadmap version: ${version}`);
      hasError = true;
    }
  }
  if (hasOpenP0Marker(completionMatrix)) {
    console.error('❌ Completion matrix still marks P0 as open.');
    hasError = true;
  }
}

for (const pattern of GITIGNORE_PATTERNS) {
  // .env is covered by `.env` and `.env.*` patterns in .gitignore
  if (pattern === '.env' && (gitignore.includes('.env\n') || gitignore.includes('.env\r\n'))) continue;
  if (pattern === '*.jsonl' && gitignore.includes('*.jsonl')) continue;
  if (!gitignore.includes(pattern)) {
    console.error(`❌ .gitignore missing pattern: ${pattern}`);
    hasError = true;
  }
}

// ── Check tracked files ──
try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  const trackedFiles = tracked.split('\n').filter(Boolean);

  for (const file of trackedFiles) {
    for (const rule of FORBIDDEN_TRACKED) {
      if (rule.pattern.test(file)) {
        if (rule.exclude && file === rule.exclude) continue;
        console.error(`❌ Tracked file matches forbidden pattern (${rule.label}): ${file}`);
        hasError = true;
      }
    }
  }
} catch {
  console.warn('⚠️  Could not run git ls-files (non-git environment?). Skipping tracked-files check.');
}

// ── Check local files not in git ──
// Only flag if the file/dir exists AND is not already gitignored.
function isGitignored(name: string): boolean {
  const lines = gitignore.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  return lines.some((line) => {
    const pattern = line.trim();
    if (pattern.endsWith('/')) return name === pattern.slice(0, -1) || name.startsWith(pattern);
    return name === pattern || name.startsWith(pattern.replace('*', ''));
  });
}

for (const pattern of FORBIDDEN_ON_DISK) {
  if (pattern.includes('*')) continue;
  const fullPath = resolve(ROOT, pattern);
  if (existsSync(fullPath) && !isGitignored(pattern)) {
    console.error(`❌ ${pattern} exists on disk but is not gitignored.`);
    hasError = true;
  }
}

// ── Check that release zip doesn't leak forbidden files ──
// Quick sanity: generated output should not contain local secrets, traces, or temp logs.
const outputDir = resolve(ROOT, '.output');
if (existsSync(outputDir)) {
  try {
    const outputFiles = execSync(
      'find .output -type f -not -path "*/node_modules/*"',
      { cwd: ROOT, encoding: 'utf8' }
    ).split('\n').filter(Boolean);

    for (const file of outputFiles) {
      if (isForbiddenOutputPath(file)) {
        console.error(`❌ Forbidden file in build output: ${file}`);
        hasError = true;
      }
    }
  } catch {
    // .output may not exist yet — that's fine
  }
}

if (!hasError) {
  const profileErrors = validateReleaseProfile(releaseProfile);
  for (const error of profileErrors) {
    console.error(`❌ ${error}`);
    hasError = true;
  }
}

if (!hasError) {
  console.log('✅ Release hygiene check passed.');
  console.log(`✅ Release profile passed: ${releaseProfile}`);
} else {
  process.exit(1);
}

function parseReleaseProfile(value: string | undefined): ReleaseProfile {
  if (!value) {
    return 'controlled-beta';
  }
  if ((RELEASE_PROFILES as readonly string[]).includes(value)) {
    return value as ReleaseProfile;
  }
  console.error(`❌ Unknown release profile: ${value}`);
  hasError = true;
  return 'controlled-beta';
}

function validateReleaseProfile(profile: ReleaseProfile): string[] {
  if (profile === 'internal-alpha') {
    return [];
  }
  const errors: string[] = [];
  if (profile === 'production') {
    if (process.env.BROWSER_HELM_REAL_MODEL_E2E_VERIFIED !== '1') {
      errors.push('Production profile requires real-model E2E verification.');
    }
    if (!sourceContains('src/agent/loop/context-assembler.ts', 'requireExplicitDomainConsent: true')) {
      errors.push('Production profile requires provider-context domain consent gate.');
    }
    if (!sourceContains('vitest.config.ts', 'branches: 80') || !sourceContains('vitest.config.ts', 'branches: 90')) {
      errors.push('Production profile requires security-critical coverage thresholds.');
    }
  }
  return errors;
}

function sourceContains(file: string, needle: string): boolean {
  const fullPath = resolve(ROOT, file);
  return existsSync(fullPath) && readFileSync(fullPath, 'utf8').includes(needle);
}

function isForbiddenOutputPath(file: string): boolean {
  const parts = file.split('/').filter(Boolean);
  const basename = parts.at(-1) ?? '';
  return parts.includes('.reasonix') ||
    parts.includes('test-results') ||
    parts.includes('artifacts') ||
    basename === '.env' ||
    basename.startsWith('.env.') ||
    basename.endsWith('.jsonl');
}

function hasOpenP0Marker(content: string): boolean {
  return /\bP0_GATE:\s*open\b/i.test(content) ||
    /\bP0_STATUS:\s*open\b/i.test(content) ||
    /\bP0\s+open\b/i.test(content) ||
    /P0\s*状态[:：]\s*open/i.test(content);
}
