#!/usr/bin/env tsx
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Remove existing pre-commit hook so developers can commit quickly.
// Full preflight (typecheck + lint + test + e2e) belongs in CI and pre-push,
// not in a blocking pre-commit. Keep pre-push for those who want to
// install it manually.
const gitDir = join(process.cwd(), '.git');
if (!existsSync(gitDir)) {
  process.exit(0);
}

const preCommitPath = join(gitDir, 'hooks', 'pre-commit');
if (existsSync(preCommitPath)) {
  unlinkSync(preCommitPath);
  console.log('Removed .git/hooks/pre-commit. Preflight moved to CI.');
} else {
  console.log('No pre-commit hook found — nothing to remove.');
}
