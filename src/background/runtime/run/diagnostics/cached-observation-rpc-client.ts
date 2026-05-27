import type { ContentRpcClient } from '../../../../page/messaging/content-rpc-client';
import type { ContentRpcRequest, ContentRpcResponse } from '../../../../page/messaging/content-rpc.schema';
import type { ToolResult } from '../../../../shared/schemas/tool-result.schema';
import type { Observation } from '../../../../shared/schemas/observation.schema';
import { CONTENT_RPC_MESSAGES } from '../../../../shared/constants/event-names';

/**
 * ContentRpcClient wrapper that caches a successful PAGE_OBSERVE response.
 * All non-observe requests fall through to the underlying client.
 */
export class CachedObservationRpcClient implements ContentRpcClient {
  constructor(
    private readonly fallback: ContentRpcClient,
    private readonly observeResult: ToolResult
  ) {}

  request(message: ContentRpcRequest): Promise<ContentRpcResponse> {
    if (
      message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE &&
      this.observeResult.ok &&
      typeof this.observeResult.data === 'object' &&
      this.observeResult.data !== null
    ) {
      return Promise.resolve({
        ok: true,
        observation: this.observeResult.data as Observation
      });
    }
    return this.fallback.request(message);
  }
}
