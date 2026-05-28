#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const cwd = process.cwd();
const root = cwd;
const outputDir = join(root, '.output');
const builtExtensionDir = join(outputDir, 'chrome-mv3');
const landingDir = join(root, 'dist', 'landing');

const extensionZip = readdirSync(outputDir).find((name) => /^browser-helm-.*-chrome\.zip$/.test(name));
if (!extensionZip) {
  throw new Error('未在 .output 目录找到浏览器扩展 zip 包，请先执行 npm run zip。');
}

rmSync(landingDir, { recursive: true, force: true });
mkdirSync(landingDir, { recursive: true });

const indexSource = join(builtExtensionDir, 'landing.html');
if (!readFileSync(indexSource)) {
  throw new Error('未找到 .output/chrome-mv3/landing.html，请先执行 npm run zip 后重试。');
}

cpSync(indexSource, join(landingDir, 'index.html'));

for (const staticDir of ['assets', 'chunks', 'icons']) {
  const sourcePath = join(builtExtensionDir, staticDir);
  const targetPath = join(landingDir, staticDir);
  cpSync(sourcePath, targetPath, { recursive: true });
}

cpSync(join(outputDir, extensionZip), join(landingDir, 'browser-helm-latest.zip'));
writeFileSync(
  join(landingDir, 'download-metadata.json'),
  JSON.stringify(
    {
      fileName: extensionZip,
      builtAt: new Date().toISOString(),
      sourceDir: '.output/chrome-mv3'
    },
    null,
    2
  ) + '\n'
);

const outputIndex = readFileSync(join(landingDir, 'index.html'), 'utf8');
const updatedIndex = outputIndex.replace('</head>', '\n  <meta name="generator" content="browser-helm landing build" />\n</head>');
writeFileSync(join(landingDir, 'index.html'), updatedIndex);

const browserHelmDownloadPath = join(landingDir, 'browser-helm-latest.zip');
console.log(`落地页资源已生成: ${dirname(browserHelmDownloadPath)}`);
