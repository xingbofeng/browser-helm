import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { chromium, type BrowserContext } from '@playwright/test';

import { getExtensionId } from '../tests/e2e/helpers/extension-id';
import { startFixtureServer, type FixtureServer } from '../tests/e2e/helpers/fixture-server';

const extensionPath = resolve('.output/chrome-mv3');
const execFileAsync = promisify(execFile);

type DebugConfig = {
  cdpPort: number;
  fixture: string;
  openDevTools: boolean;
  openSidePanelPage: boolean;
  profileDir: string;
  targetUrl: string | undefined;
  exitAfterReady: boolean;
  watch: boolean;
};

type DebugSession = {
  context: BrowserContext;
  extensionId: string;
  profileDir: string;
  sidePanelUrl: string | undefined;
  targetUrl: string;
};

async function main(): Promise<void> {
  assertBuiltExtension();

  const config = readConfig();
  const server = config.targetUrl ? undefined : await startFixtureServer();
  const targetUrl = config.targetUrl ?? fixtureUrl(server, config.fixture);
  let session = await openDebugSession(config, targetUrl);

  try {
    printReady({
      browserPath: chromium.executablePath(),
      cdpPort: config.cdpPort,
      extensionId: session.extensionId,
      extensionPath,
      profileDir: session.profileDir,
      sidePanelUrl: session.sidePanelUrl,
      targetUrl: session.targetUrl
    });

    const watcher = config.watch
      ? startAutoReload(async () => {
          await session.context.close().catch(() => undefined);
          session = await openDebugSession(config, targetUrl);
          printReloaded({
            extensionId: session.extensionId,
            sidePanelUrl: session.sidePanelUrl,
            targetUrl: session.targetUrl
          });
        })
      : undefined;

    if (config.exitAfterReady) {
      watcher?.close();
      await session.context.close();
      await server?.close();
      return;
    }

    await waitForShutdown(() => session.context, server, watcher);
  } catch (error) {
    await session.context.close();
    await server?.close();
    throw error;
  }
}

function assertBuiltExtension(): void {
  if (!existsSync(join(extensionPath, 'manifest.json'))) {
    throw new Error(
      `Missing ${join(extensionPath, 'manifest.json')}. Run "npm run build" first.`
    );
  }
}

function readConfig(): DebugConfig {
  return {
    cdpPort: Number(process.env.BROWSER_HELM_DEBUG_CDP_PORT ?? 9333),
    fixture: process.env.BROWSER_HELM_DEBUG_FIXTURE ?? 'basic-form.html',
    openDevTools: process.env.BROWSER_HELM_DEBUG_DEVTOOLS === '1',
    openSidePanelPage: process.env.BROWSER_HELM_DEBUG_OPEN_SIDEPANEL !== '0',
    profileDir:
      process.env.BROWSER_HELM_DEBUG_PROFILE ??
      mkdtempSync(join(tmpdir(), 'browser-helm-debug-')),
    targetUrl: process.env.BROWSER_HELM_DEBUG_URL,
    exitAfterReady: process.env.BROWSER_HELM_DEBUG_EXIT_AFTER_READY === '1',
    watch: process.env.BROWSER_HELM_DEBUG_WATCH === '1'
  };
}

async function launchDebugContext(config: DebugConfig): Promise<BrowserContext> {
  return await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    viewport: null,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--remote-debugging-port=${config.cdpPort}`,
      ...(config.openDevTools ? ['--auto-open-devtools-for-tabs'] : [])
    ]
  });
}

async function openDebugSession(
  config: DebugConfig,
  targetUrl: string
): Promise<DebugSession> {
  const context = await launchDebugContext(config);
  const extensionId = await getExtensionId(context);
  const page = await context.newPage();
  await page.goto(targetUrl);
  const tabId = await activeTabId(context);

  let sidePanelUrl: string | undefined;
  if (config.openSidePanelPage) {
    sidePanelUrl = `chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`;
    const sidePanelPage = await context.newPage();
    await sidePanelPage.goto(sidePanelUrl);
  }

  return {
    context,
    extensionId,
    profileDir: config.profileDir,
    sidePanelUrl,
    targetUrl
  };
}

async function activeTabId(context: BrowserContext): Promise<number> {
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  return await worker.evaluate<number>(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active tab');
    }
    return tab.id;
  });
}

function fixtureUrl(server: FixtureServer | undefined, fixture: string): string {
  if (!server) {
    throw new Error('Fixture server is not running');
  }
  return `${server.origin}/${fixture.replace(/^\/+/u, '')}`;
}

function printReady(details: {
  browserPath: string;
  cdpPort: number;
  extensionId: string;
  extensionPath: string;
  profileDir: string;
  sidePanelUrl: string | undefined;
  targetUrl: string;
}): void {
  console.log('');
  console.log('BrowserHelm extension debug session is ready.');
  console.log('');
  console.log(`Browser: ${details.browserPath}`);
  console.log(`Profile: ${details.profileDir}`);
  console.log(`Extension: ${details.extensionPath}`);
  console.log(`Extension ID: ${details.extensionId}`);
  console.log(`Target page: ${details.targetUrl}`);
  if (details.sidePanelUrl) {
    console.log(`Side panel debug page: ${details.sidePanelUrl}`);
  }
  console.log(`CDP: http://127.0.0.1:${details.cdpPort}`);
  if (process.env.BROWSER_HELM_DEBUG_WATCH === '1') {
    console.log('Watch: enabled, debug browser will rebuild and restart after source changes.');
  }
  console.log('');
  console.log('Press Ctrl+C to close this debug browser.');
}

function printReloaded(details: {
  extensionId: string;
  sidePanelUrl: string | undefined;
  targetUrl: string;
}): void {
  console.log('[debug:extension] Debug browser restarted.');
  console.log(`[debug:extension] Extension ID: ${details.extensionId}`);
  console.log(`[debug:extension] Target page: ${details.targetUrl}`);
  if (details.sidePanelUrl) {
    console.log(`[debug:extension] Side panel debug page: ${details.sidePanelUrl}`);
  }
}

type AutoReloadWatcher = {
  close: () => void;
};

function startAutoReload(restartSession: () => Promise<void>): AutoReloadWatcher {
  let reloading = false;
  let pending = false;
  let snapshot = sourceSnapshot();

  const interval = setInterval(() => {
    const nextSnapshot = sourceSnapshot();
    if (snapshotChanged(snapshot, nextSnapshot)) {
      snapshot = nextSnapshot;
      void rebuildAndReload();
    }
  }, 1_000);

  async function rebuildAndReload(): Promise<void> {
    if (reloading) {
      pending = true;
      return;
    }

    reloading = true;
    pending = false;
    try {
      console.log('');
      console.log('[debug:extension] Source changed. Rebuilding extension...');
      await execFileAsync('npm', ['run', 'build'], { cwd: process.cwd() });
      await restartSession();
      console.log('[debug:extension] Extension updated.');
    } catch (error) {
      console.error('[debug:extension] Update failed.');
      console.error(error);
    } finally {
      reloading = false;
      if (pending) {
        void rebuildAndReload();
      }
    }
  }

  return {
    close: () => {
      clearInterval(interval);
    }
  };
}

type SourceSnapshot = Map<string, number>;

function sourceSnapshot(): SourceSnapshot {
  const files = [
    ...sourceFiles(resolve('src')),
    resolve('wxt.config.ts'),
    resolve('package.json'),
    resolve('tsconfig.json')
  ].filter((filePath) => existsSync(filePath) && !shouldIgnoreFile(filePath));

  return new Map(files.map((filePath) => [filePath, statSync(filePath).mtimeMs]));
}

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(root, entry.name);
    if (shouldIgnoreFile(filePath)) {
      return [];
    }
    if (entry.isDirectory()) {
      return sourceFiles(filePath);
    }
    return entry.isFile() ? [filePath] : [];
  });
}

function shouldIgnoreFile(filePath: string): boolean {
  return (
    filePath.endsWith('wxt-globals.d.ts') ||
    filePath.includes('/.DS_Store') ||
    filePath.includes('/.git/') ||
    filePath.endsWith('~') ||
    filePath.endsWith('.swp')
  );
}

function snapshotChanged(previous: SourceSnapshot, next: SourceSnapshot): boolean {
  if (previous.size !== next.size) {
    return true;
  }

  for (const [filePath, mtime] of next) {
    if (previous.get(filePath) !== mtime) {
      return true;
    }
  }
  return false;
}

async function waitForShutdown(
  getContext: () => BrowserContext,
  server: FixtureServer | undefined,
  watcher: AutoReloadWatcher | undefined
): Promise<void> {
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    watcher?.close();
    await getContext().close();
    await server?.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  await new Promise<void>(() => {
    // Keep the process alive for interactive debugging.
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
