import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium, type BrowserContext } from '@playwright/test';

export type LaunchedExtension = {
  context: BrowserContext;
  extensionPath: string;
};

export async function launchExtension(): Promise<LaunchedExtension> {
  const extensionPath = join(process.cwd(), '.output/chrome-mv3');
  const userDataDir = mkdtempSync(join(tmpdir(), 'browser-helm-e2e-'));
  const headless = process.env.BROWSER_HELM_E2E_HEADLESS !== '0';
  const context = await chromium.launchPersistentContext(userDataDir, {
    ...(headless ? { channel: 'chromium' } : {}),
    headless,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  return {
    context,
    extensionPath
  };
}
