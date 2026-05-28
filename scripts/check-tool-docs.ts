/**
 * Checks that every tool in ToolRegistry / TOOL_NAMES is documented in
 * src/tools/README.md, and that no deprecated/removed tools are still
 * advertised as active capabilities.
 *
 * Usage: npx tsx scripts/check-tool-docs.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

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
