import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  TOOL_MANIFEST,
  TOOL_MANIFEST_MODULES_HASH,
  listToolSpecs
} from '../../../src/tools';

const root = process.cwd();

describe('tool manifest allowlist', () => {
  it('does not use automatic glob exposure in the runtime registry entrypoint', () => {
    const source = readFileSync(resolve(root, 'src/tools/index.ts'), 'utf8');

    expect(source).not.toContain('import.meta.glob');
  });

  it('explicitly lists every bh-* tool module', () => {
    const manifestModules = new Set(TOOL_MANIFEST.map((entry) => entry.module));

    expect([...manifestModules].sort()).toEqual(discoverToolModules());
  });

  it('keeps the manifest module hash in sync with the allowlist', () => {
    expect(TOOL_MANIFEST_MODULES_HASH).toBe(hashManifestModules(TOOL_MANIFEST.map((entry) => entry.module)));
  });

  it('builds the runtime registry only from manifest entries', () => {
    const specs = listToolSpecs({} as never);

    expect(specs.length).toBeGreaterThan(60);
    expect(new Set(specs.map((tool) => tool.name)).size).toBe(specs.length);
  });
});

function discoverToolModules(): string[] {
  return walk(resolve(root, 'src/tools'))
    .filter((file) => /\/bh-[^/]+\.ts$/u.test(file))
    .map((file) => `./${relative(resolve(root, 'src/tools'), file).replaceAll('\\', '/')}`)
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
