import type { BrowserContext } from '@playwright/test';

export async function getExtensionId(context: BrowserContext): Promise<string> {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  const url = serviceWorker.url();
  const match = /^chrome-extension:\/\/([^/]+)/u.exec(url);
  if (!match?.[1]) {
    throw new Error(`Unable to parse extension id from ${url}`);
  }
  return match[1];
}
