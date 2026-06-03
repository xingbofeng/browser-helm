/**
 * Checks that every tool in ToolRegistry / TOOL_NAMES is documented in
 * src/tools/README.md, and that no deprecated/removed tools are still
 * advertised as active capabilities.
 *
 * Usage: npx tsx scripts/check-tool-docs.ts
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();

// ── Check explicit tool manifest allowlist ──
const INDEX_PATH = resolve(ROOT, 'src/tools/index.ts');
const indexSource = readFileSync(INDEX_PATH, 'utf8');
if (indexSource.includes('import.meta.glob')) {
  console.error('❌ src/tools/index.ts must use the explicit tool manifest, not import.meta.glob.');
  process.exit(1);
}

const TOOL_MANIFEST_PATH = resolve(ROOT, 'src/tools/tool-manifest.ts');
const toolManifestSource = readFileSync(TOOL_MANIFEST_PATH, 'utf8');
const manifestModuleRegex = /module:\s*'([^']+)'/g;
const manifestModules: string[] = [];
let manifestMatch: RegExpExecArray | null;
while ((manifestMatch = manifestModuleRegex.exec(toolManifestSource)) !== null) {
  manifestModules.push(manifestMatch[1]!);
}
const discoveredToolModules = discoverToolModules();
const missingManifestModules = discoveredToolModules.filter((module) => !manifestModules.includes(module));
const extraManifestModules = manifestModules.filter((module) => !discoveredToolModules.includes(module));
const hashMatch = toolManifestSource.match(/TOOL_MANIFEST_MODULES_HASH\s*=\s*'([^']+)'/);
const expectedManifestHash = hashManifestModules(manifestModules);
const actualManifestHash = hashMatch?.[1];

// ── Read tool names from TOOL_NAMES constant ──
const TOOL_NAMES_PATH = resolve(ROOT, 'src/shared/constants/tool-names.ts');
const toolNamesSource = readFileSync(TOOL_NAMES_PATH, 'utf8');
const toolNameRegex = /^\s+(\w+):\s*'([^']+)'/gm;

const allToolNames = new Map<string, string>(); // bh_name → constant name
let match: RegExpExecArray | null;
while ((match = toolNameRegex.exec(toolNamesSource)) !== null) {
  allToolNames.set(match[2]!, match[1]!);
}

// ── Known hidden/deprecated tools ──
const HIDDEN_TOOLS = new Set(['bh_iframe_click', 'bh_iframe_type']);

// ── Read README ──
const README_PATH = resolve(ROOT, 'src/tools/README.md');
const readme = readFileSync(README_PATH, 'utf8');

// ── Check each tool ──
const missingInDocs: string[] = [];
const deprecatedStillAdvertised: string[] = [];

for (const [name] of allToolNames) {
  if (HIDDEN_TOOLS.has(name)) {
    // Should have strikethrough in README
    if (!readme.includes(`~~\`${name}\`~~`)) {
      deprecatedStillAdvertised.push(name);
    }
    continue;
  }
  // Skip internal tools that don't need README entries
  if (['bh_agent_finish', 'bh_agent_fail', 'bh_agent_ask_user', 'bh_request_act_mode'].includes(name)) {
    continue;
  }
  if (!readme.includes(`\`${name}\``)) {
    missingInDocs.push(name);
  }
}

// ── Report ──
let hasError = false;

if (missingManifestModules.length > 0) {
  console.error('❌ bh-* tool modules missing from src/tools/tool-manifest.ts:');
  for (const module of missingManifestModules) console.error(`   - ${module}`);
  hasError = true;
}

if (extraManifestModules.length > 0) {
  console.error('❌ src/tools/tool-manifest.ts references modules that do not exist:');
  for (const module of extraManifestModules) console.error(`   - ${module}`);
  hasError = true;
}

if (actualManifestHash !== expectedManifestHash) {
  console.error(`❌ TOOL_MANIFEST_MODULES_HASH is out of date. Expected ${expectedManifestHash}, got ${actualManifestHash ?? 'missing'}.`);
  hasError = true;
}

if (missingInDocs.length > 0) {
  console.error('❌ Tools in TOOL_NAMES but missing from src/tools/README.md:');
  for (const name of missingInDocs) console.error(`   - ${name}`);
  hasError = true;
}

if (deprecatedStillAdvertised.length > 0) {
  console.error('❌ Deprecated tools that should be strikethrough in README:');
  for (const name of deprecatedStillAdvertised) console.error(`   - ${name}`);
  hasError = true;
}

if (!hasError) {
  console.log(`✅ All ${allToolNames.size} tool names consistent between TOOL_NAMES and README.`);
} else {
  process.exit(1);
}

function discoverToolModules(): string[] {
  return walk(resolve(ROOT, 'src/tools'))
    .filter((file) => /\/bh-[^/]+\.ts$/u.test(file))
    .map((file) => `./${relative(resolve(ROOT, 'src/tools'), file).replaceAll('\\', '/')}`)
    .sort();
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }
    return [fullPath];
  });
}

function hashManifestModules(modules: string[]): string {
  return createHash('sha256')
    .update([...modules].sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
}
