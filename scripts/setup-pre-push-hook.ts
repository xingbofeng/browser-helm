#!/usr/bin/env tsx
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const gitDir = join(process.cwd(), '.git');
if (!existsSync(gitDir)) {
  process.exit(0);
}

const hooksDir = join(gitDir, 'hooks');
mkdirSync(hooksDir, { recursive: true });

const prePushPath = join(hooksDir, 'pre-push');
writeFileSync(
  prePushPath,
  [
    '#!/usr/bin/env sh',
    'set -e',
    'npm run preflight',
    ''
  ].join('\n')
);
chmodSync(prePushPath, 0o755);
console.log('Installed .git/hooks/pre-push to run npm run preflight.');
