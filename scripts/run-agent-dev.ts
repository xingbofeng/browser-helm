import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium, type BrowserContext, type Worker } from '@playwright/test';

import { ContextBuilder } from '../src/agent/context/context-builder';
import { AgentLoop } from '../src/agent/kernel/agent-loop';
import { OpenAICompatibleClient } from '../src/agent/model/open-ai-compatible-client';
import {
  readDotEnvFile,
  resolveProviderConfigWithDotEnvFallback
} from '../src/agent/model/provider-config';
import { DecisionParser } from '../src/agent/parser/decision-parser';
import type { ContentRpcClient } from '../src/page/messaging/content-rpc-client';
import {
  type ContentRpcRequest,
  type ContentRpcResponse
} from '../src/page/messaging/content-rpc.schema';
import { InMemoryTraceRecorder } from '../src/storage/memory/in-memory-trace-recorder';
import { bhA11yRefreshRefs } from '../src/tools/a11y/bh-a11y-refresh-refs';
import { bhA11yResolveRef } from '../src/tools/a11y/bh-a11y-resolve-ref';
import { bhA11ySnapshot } from '../src/tools/a11y/bh-a11y-snapshot';
import { bhAgentAskUser } from '../src/tools/agent/bh-agent-ask-user';
import { bhAgentFail } from '../src/tools/agent/bh-agent-fail';
import { bhAgentFinish } from '../src/tools/agent/bh-agent-finish';
import { ToolRegistry } from '../src/tools/core/tool-registry';
import { ToolRouter } from '../src/tools/core/tool-router';
import { bhPageObserve } from '../src/tools/page/bh-page-observe';

const extensionPath = resolve('.output/chrome-mv3');

async function main(): Promise<void> {
  assertBuiltExtension();
  const providerConfig = resolveProviderConfigWithDotEnvFallback(
    process.env,
    readDotEnvFile('.env')
  );
  if (!providerConfig) {
    throw new Error(
      'Real provider config is required. Set OPENAI_BASE_URL, OPENAI_API_KEY, and OPENAI_MODEL in the environment or .env.'
    );
  }

  const task = process.argv.slice(2).join(' ').trim() || 'Observe current page and finish';
  const targetUrl = process.env.BROWSER_HELM_AGENT_URL ?? 'https://counterxing.top';
  const context = await launchAgentContext();

  try {
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    const tabId = await activeTabId(context);
    const rpc = new ExtensionWorkerContentRpcClient(context, tabId);

    const registry = new ToolRegistry();
    registry.register(bhPageObserve(rpc));
    registry.register(bhA11ySnapshot(rpc));
    registry.register(bhA11yResolveRef(rpc));
    registry.register(bhA11yRefreshRefs(rpc));
    registry.register(bhAgentFinish);
    registry.register(bhAgentFail);
    registry.register(bhAgentAskUser);

    const traceRecorder = new InMemoryTraceRecorder();
    const loop = new AgentLoop({
      modelClient: new OpenAICompatibleClient(providerConfig),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder,
      runtimeMetadata: {
        model: providerConfig.model,
        providerBaseUrl: providerConfig.baseUrl
      }
    });

    const result = await loop.run({
      task,
      maxSteps: Number(process.env.BROWSER_HELM_AGENT_MAX_STEPS ?? 5)
    });

    console.log(`targetUrl=${targetUrl}`);
    console.log(`status=${result.status}`);
    if (result.message) {
      console.log(`message=${result.message}`);
    }
    if (result.errorCode) {
      console.log(`errorCode=${result.errorCode}`);
    }
    console.log(JSON.stringify(result.trace, null, 2));
  } finally {
    await context.close();
  }
}

class ExtensionWorkerContentRpcClient implements ContentRpcClient {
  constructor(
    private readonly context: BrowserContext,
    private readonly tabId: number
  ) {}

  async request(message: ContentRpcRequest): Promise<ContentRpcResponse> {
    const worker = await extensionWorker(this.context);
    const raw = await worker.evaluate<unknown, { tabId: number; message: ContentRpcRequest }>(
      async ({ tabId, message: request }) => {
        try {
          return await chrome.tabs.sendMessage(tabId, request);
        } catch (error) {
          return {
            ok: false,
            code: 'CONTENT_SCRIPT_UNAVAILABLE',
            message: error instanceof Error ? error.message : 'Content script unavailable'
          };
        }
      },
      { tabId: this.tabId, message }
    );
    return parseContentRpcResponse(raw);
  }
}

function parseContentRpcResponse(raw: unknown): ContentRpcResponse {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean') {
    return {
      ok: false,
      code: 'CONTENT_RPC_INVALID_RESPONSE',
      message: 'Content RPC returned an invalid response'
    };
  }

  if (!raw.ok) {
    return {
      ok: false,
      code: typeof raw.code === 'string' ? raw.code : 'CONTENT_RPC_FAILED',
      message: typeof raw.message === 'string' ? raw.message : 'Content RPC failed',
      detail: raw.detail
    };
  }

  if ('observation' in raw || 'snapshot' in raw || 'ref' in raw) {
    return raw as ContentRpcResponse;
  }

  return {
    ok: false,
    code: 'CONTENT_RPC_INVALID_RESPONSE',
    message: 'Content RPC success response did not include data'
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertBuiltExtension(): void {
  if (!existsSync(join(extensionPath, 'manifest.json'))) {
    throw new Error(
      `Missing ${join(extensionPath, 'manifest.json')}. Run "npm run build" first.`
    );
  }
}

async function launchAgentContext(): Promise<BrowserContext> {
  const userDataDir =
    process.env.BROWSER_HELM_AGENT_PROFILE ??
    mkdtempSync(join(tmpdir(), 'browser-helm-agent-'));
  const headless = process.env.BROWSER_HELM_AGENT_HEADLESS !== '0';
  return await chromium.launchPersistentContext(userDataDir, {
    ...(headless ? { channel: 'chromium' } : {}),
    headless,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
}

async function activeTabId(context: BrowserContext): Promise<number> {
  const worker = await extensionWorker(context);
  return await worker.evaluate<number>(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active tab');
    }
    return tab.id;
  });
}

async function extensionWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
