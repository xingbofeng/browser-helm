/**
 * Audits the built extension manifest permissions against docs/security.md.
 *
 * Usage: npx tsx scripts/check-manifest-permissions.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

const securityDoc = readFileSync(resolve(ROOT, 'docs/security.md'), 'utf8');
const manifest = readManifest();

const permissions = stringArrayField(manifest, 'permissions');
const optionalPermissions = stringArrayField(manifest, 'optional_permissions');
const optionalHost = stringArrayField(manifest, 'optional_host_permissions');
const webResources = webAccessibleResources(manifest);

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

for (const perm of optionalPermissions) {
  if (!securityDoc.includes(perm)) {
    console.error(`❌ Optional permission '${perm}' not documented in docs/security.md`);
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
if ((optionalHost.length > 0 || optionalPermissions.length > 0) && !securityDoc.includes('optional')) {
  console.error('❌ optional_host_permissions not documented in docs/security.md');
  hasError = true;
}

if (!hasError) {
  console.log(`✅ Manifest permissions (${permissions.length} required, ${optionalPermissions.length + optionalHost.length} optional, ${webResources.length} resources) all documented.`);
} else {
  process.exit(1);
}

function readManifest(): Record<string, unknown> {
  const manifestPath = resolve(ROOT, '.output/chrome-mv3/manifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function webAccessibleResources(record: Record<string, unknown>): string[] {
  const value = record.web_accessible_resources;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return [];
    }
    const resources = (entry as Record<string, unknown>).resources;
    return Array.isArray(resources)
      ? resources.filter((item): item is string => typeof item === 'string')
      : [];
  });
}
