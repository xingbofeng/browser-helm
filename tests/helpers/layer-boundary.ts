import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

type BoundaryRule = {
  files: string[];
  imports: string[];
};

type BoundaryOptions = {
  rootDir: string;
  forbidden: BoundaryRule[];
};

export function assertLayerBoundaries(options: BoundaryOptions): string[] {
  const violations: string[] = [];

  for (const rule of options.forbidden) {
    for (const pattern of rule.files) {
      const files = findMatchingFiles(options.rootDir, pattern);

      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        for (const forbiddenImport of rule.imports) {
          if (text.includes(forbiddenImport)) {
            violations.push(
              `${relative(options.rootDir, file)} imports ${forbiddenImport}`
            );
          }
        }
      }
    }
  }

  return violations;
}

function findMatchingFiles(rootDir: string, pattern: string): string[] {
  const files = listFiles(rootDir);
  return files.filter((file) => matchesPattern(relative(rootDir, file), pattern));
}

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.output') {
      continue;
    }
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listFiles(path));
    } else {
      files.push(path);
    }
  }

  return files;
}

function matchesPattern(file: string, pattern: string): boolean {
  if (pattern.endsWith('/**/*.ts*')) {
    const prefix = pattern.slice(0, -'/**/*.ts*'.length);
    return file.startsWith(`${prefix}/`) && /\.tsx?$/u.test(file);
  }
  if (pattern.endsWith('/**/*.ts')) {
    const prefix = pattern.slice(0, -'/**/*.ts'.length);
    return file.startsWith(`${prefix}/`) && file.endsWith('.ts');
  }
  return file === pattern;
}
