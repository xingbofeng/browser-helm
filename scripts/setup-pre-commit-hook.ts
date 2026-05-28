import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const gitDir = join(process.cwd(), '.git');
if (!existsSync(gitDir)) {
  process.exit(0);
}

const hooksDir = join(gitDir, 'hooks');
mkdirSync(hooksDir, { recursive: true });

const preCommitPath = join(hooksDir, 'pre-commit');
const hookScript = `#!/usr/bin/env sh
set -e
cd "$(dirname "$0")/../.."
npm run preflight
`;

writeFileSync(preCommitPath, hookScript, { mode: 0o755 });
chmodSync(preCommitPath, 0o755);
