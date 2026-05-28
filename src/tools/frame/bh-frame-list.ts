import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

/**
 * 列出当前浏览器页面的 frame 树。
 *
 * 面向 Debug/Form/Act 模式的只读辅助工具，用于诊断 iframe 承载的表单、widget 及
 * 跨 frame ref。不修改页面状态，风险等级 safe，返回 frame id、URL、parent frame id
 * 和 top-frame 标记，供后续 frame 工具进行路由和排障。
 */
export function bhFrameList(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_frame_list',
    // 调试跨域 iframe 与动态 widget 时列出当前页面 frame 元信息。
    title: 'Frame List',
    description: 'Lists frame ids and urls for the current page',
    ui: {
      titleKey: 'tool.title.bh_frame_list',
      descriptionKey: 'tool.description.bh_frame_list',
    },
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
