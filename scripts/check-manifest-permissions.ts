/**
 * Audits wxt.config.ts manifest permissions against docs/security.md.
 *
 * Usage: npx tsx scripts/check-manifest-permissions.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

const wxtConfig = readFileSync(resolve(ROOT, 'wxt.config.ts'), 'utf8');
const securityDoc = readFileSync(resolve(ROOT, 'docs/security.md'), 'utf8');

// ── Extract permissions from wxt.config.ts ──
const permissionsMatch = wxtConfig.match(/permissions:\s*\[([^\]]+)\]/);
const optionalMatch = wxtConfig.match(/optional_host_permissions:\s*\[([^\]]+)\]/);
const resourcesMatch = wxtConfig.match(/web_accessible_resources:\s*\[[\s\S]*?resources:\s*\[([^\]]+)\]/);

function parseList(match: RegExpMatchArray | null): string[] {
  if (!match?.[1]) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/['"]/g, ''))
    .filter(Boolean);
}

const permissions = parseList(permissionsMatch);
const optionalHost = parseList(optionalMatch);
const webResources = parseList(resourcesMatch);

// ── Check docs/security.md covers each permission ──
let hasError = false;

const requiredPermissions = [...permissions.filter((p) => p !== 'webNavigation')];

for (const perm of requiredPermissions) {
  const clean = perm.replace(/['"]/g, '');
  if (!securityDoc.includes(clean)) {
    console.error(`❌ Permission '${clean}' not documented in docs/security.md`);
    hasError = true;
  }
}

// Web-accessible resources check
for (const res of webResources) {
  const clean = res.replace(/['"]/g, '').trim();
  if (clean === 'assets/*' || clean === 'icons/*') continue;
  if (!securityDoc.includes(clean.replace('*.', ''))) {
    console.error(`❌ Web-accessible resource '${clean}' not documented in docs/security.md`);
    hasError = true;
  }
}

// Optional host permissions check
if (optionalHost.length > 0 && !securityDoc.includes('optional')) {
  console.error('❌ optional_host_permissions not documented in docs/security.md');
  hasError = true;
}

if (!hasError) {
  console.log(`✅ Manifest permissions (${permissions.length} required, ${optionalHost.length} optional, ${webResources.length} resources) all documented.`);
} else {
  process.exit(1);
}
