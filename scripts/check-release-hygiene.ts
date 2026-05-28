/**
 * Checks that no sensitive or temporary files would leak into a release.
 *
 * Usage: npx tsx scripts/check-release-hygiene.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

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
// Quick sanity: the .output directory should not contain .env or .reasonix
const outputDir = resolve(ROOT, '.output');
if (existsSync(outputDir)) {
  try {
    const outputFiles = execSync(
      'find .output -type f -not -path "*/node_modules/*"',
      { cwd: ROOT, encoding: 'utf8' }
    ).split('\n').filter(Boolean);

    for (const file of outputFiles) {
      const basename = file.split('/').pop() ?? '';
      if (basename === '.env' || basename === '.env.local' || basename.endsWith('.jsonl')) {
        console.error(`❌ Forbidden file in build output: ${file}`);
        hasError = true;
      }
    }
  } catch {
    // .output may not exist yet — that's fine
  }
}

if (!hasError) {
  console.log('✅ Release hygiene check passed.');
} else {
  process.exit(1);
}
