import type {
  ContentRpcRequest,
  ContentRpcResponse
} from './content-rpc.schema';

export interface ContentRpcClient {
  request(message: ContentRpcRequest): Promise<ContentRpcResponse>;
}

export class ChromeContentRpcClient implements ContentRpcClient {
  constructor(private readonly tabId: number) {}

  async request(message: ContentRpcRequest): Promise<ContentRpcResponse> {
    if (!globalThis.chrome?.tabs?.sendMessage) {
      return {
        ok: false,
        code: 'CONTENT_SCRIPT_UNAVAILABLE',
        message: 'Chrome tabs messaging is unavailable'
      };
    }

    try {
      return await chrome.tabs.sendMessage(this.tabId, message);
    } catch (error) {
      return {
        ok: false,
        code: 'CONTENT_SCRIPT_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'Content script unavailable'
      };
    }
  }
}
