import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

/**
 * Lists the frame tree for the current browser page.
 *
 * Use this read-only Debug/Form/Act helper when diagnosing iframe-hosted forms,
 * widgets, and cross-frame refs. It never changes page state, carries safe risk,
 * and returns frame ids, URLs, parent frame ids, and top-frame markers that later
 * frame tools can use for routing and troubleshooting.
 */
export function bhFrameList(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_frame_list',
    // 调试跨域 iframe 与动态 widget 时列出当前页面 frame 元信息。
    title: 'Frame List',
    description: 'Lists frame ids and urls for the current page',
    modes: ['debug', 'form', 'act'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.FRAME_LIST });
      if (!response.ok) {
        return {
          ok: false,
          code: response.code,
          summary: response.message,
          error: {
            message: response.message,
            detail: response.detail
          },
          changedPage: false,
          requiresObserve: false
        };
      }
      if (!('frames' in response)) {
        return {
          ok: false,
          code: ERROR_CODES.OBSERVATION_FAILED,
          summary: 'Content RPC did not return frame metadata',
          error: {
            message: 'Content RPC did not return frame metadata'
          },
          changedPage: false,
          requiresObserve: false
        };
      }

      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Detected ${response.frames.length} frames`,
        data: { frames: response.frames },
        nextHints: ['Use frame urls to diagnose iframe-hosted forms and widgets'],
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: JSON.stringify({
            frames: response.frames.map((frame) => ({
              frameId: frame.frameId,
              url: frame.url,
              isTop: frame.isTop
            }))
          })
        }
      };
    }
  };
}
