import { ERROR_CODES } from '../../shared/constants/error-codes';
import type {
  ContentRpcRequest,
  ContentRpcResponse
} from './content-rpc.schema';
import {
  createContentRpcStrategies,
  mergeFrameObservationResponses,
  type ContentRpcStrategy
} from './content-rpc-strategies';
import {
  BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY,
  evaluateBrowserHelmDomainPolicy,
  isBrowserHelmDomainPolicy,
  type BrowserHelmDomainPolicy
} from '../../shared/domain-policy';

export interface ContentRpcClient {
  request(message: ContentRpcRequest): Promise<ContentRpcResponse>;
}

export class ChromeContentRpcClient implements ContentRpcClient {
  private static readonly ensuredContentScriptTabs = new Set<number>();

  private readonly strategies: Map<ContentRpcRequest['type'], ContentRpcStrategy>;

  constructor(private readonly tabId: number) {
    this.strategies = new Map(
      createContentRpcStrategies({
        frames: () => this.frames(),
        sendFrameMessage: (frameId, message) =>
          this.sendFrameMessage(frameId, message)
      }).map((strategy) => [strategy.type, strategy])
    );
  }

  async request(message: ContentRpcRequest): Promise<ContentRpcResponse> {
    if (!globalThis.chrome?.tabs?.sendMessage) {
      return {
        ok: false,
        code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
        message: 'Chrome tabs messaging is unavailable'
      };
    }

    try {
      await this.ensureContentScript();
      const strategy = this.strategies.get(message.type);
      return strategy
        ? await strategy.execute(message)
        : await this.sendFrameMessage(undefined, message);
    } catch (error) {
      return {
        ok: false,
        code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
        message: error instanceof Error ? error.message : 'Content script unavailable'
      };
    }
  }

  private async frames(): Promise<
    Array<{
      frameId: number;
      url?: string | undefined;
      parentFrameId?: number | undefined;
    }>
  > {
    if (!globalThis.chrome?.webNavigation?.getAllFrames) {
      return [{ frameId: 0 }];
    }
    const frames = await chrome.webNavigation.getAllFrames({ tabId: this.tabId });
    return frames?.map((frame) => ({
      frameId: frame.frameId,
      url: frame.url,
      ...(frame.parentFrameId !== undefined
        ? { parentFrameId: frame.parentFrameId }
        : {})
    })) ?? [{ frameId: 0 }];
  }

  private async sendFrameMessage(
    frameId: number | undefined,
    message: ContentRpcRequest
  ): Promise<ContentRpcResponse> {
    return await chrome.tabs.sendMessage(this.tabId, message, {
      frameId
    });
  }

  private async ensureContentScript(): Promise<void> {
    if (!globalThis.chrome?.scripting?.executeScript) {
      return;
    }
    if (ChromeContentRpcClient.ensuredContentScriptTabs.has(this.tabId)) {
      return;
    }
    if (!(await this.isDomainAllowedForTab())) {
      return;
    }

    try {
      await chrome.scripting.executeScript({
        target: {
          tabId: this.tabId,
          allFrames: true
        },
        files: ['content-scripts/content.js']
      });
      ChromeContentRpcClient.ensuredContentScriptTabs.add(this.tabId);
    } catch {
      // Some pages cannot be injected. The follow-up sendMessage keeps the
      // existing CONTENT_SCRIPT_UNAVAILABLE reporting path.
    }
  }

  private async isDomainAllowedForTab(): Promise<boolean> {
    if (!globalThis.chrome?.tabs?.get) {
      return true;
    }
    try {
      const tab = await chrome.tabs.get(this.tabId);
      const policy = await this.readDomainPolicy();
      return evaluateBrowserHelmDomainPolicy(tab.url, policy).allowed;
    } catch {
      return true;
    }
  }

  private async readDomainPolicy(): Promise<BrowserHelmDomainPolicy | undefined> {
    if (!globalThis.chrome?.storage?.local) {
      return undefined;
    }
    const result = await chrome.storage.local.get(BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY);
    const value = result[BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY];
    return isBrowserHelmDomainPolicy(value) ? value : undefined;
  }
}

export { mergeFrameObservationResponses };
export type { FrameRpcResponse } from './content-rpc-strategies';
