import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const emptyArgsSchema = z.object({}).strict();
const queryArgsSchema = z.object({
  hostSelector: z.string().min(1),
  selector: z.string().min(1)
}).strict();

/**
 * 列出页面中的 open shadow roots。
 *
 * Agent 语义：Advanced 只读诊断工具，用于发现 Web Component / Shadow DOM 中
 * DOM/a11y 主观察可能漏掉的交互区域。不会穿透 closed shadow root，不修改页面，
 * 风险 safe，不触发 approval；返回 host selector、文本预览和交互元素数量。
 */
export function bhShadowList(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof emptyArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.SHADOW_LIST,
    title: 'List Shadow Roots',
    description: 'Lists open shadow roots and host summaries for advanced page inspection.',
    modes: ['advanced'],
    risk: 'safe',
    argsSchema: emptyArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: async () => {
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.SHADOW_LIST });
      if (!response.ok) {
        return failure(response.message, response.code);
      }
      if (!('shadowRoots' in response)) {
        return failure('Shadow root list response is unavailable');
      }
      const count = response.shadowRoots.length;
      return ok(`Found ${count} open shadow roots.`, { shadowRoots: response.shadowRoots });
    }
  };
}

/**
 * 查询指定 open shadow root 内的元素。
 *
 * Agent 语义：Advanced 只读诊断工具，用于在已知 shadow host 下读取按钮、链接、
 * 输入框或文本节点摘要。不会执行点击/输入，不修改页面，风险 safe，不触发 approval。
 * 参数 hostSelector 指定宿主元素，selector 指定 shadowRoot 内查询选择器。
 */
export function bhShadowQuery(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof queryArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.SHADOW_QUERY,
    title: 'Query Shadow Root',
    description: 'Reads element summaries inside a selected open shadow root.',
    modes: ['advanced'],
    risk: 'safe',
    argsSchema: queryArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: async (args) => {
      const response = await rpc.request({
        type: CONTENT_RPC_MESSAGES.SHADOW_QUERY,
        hostSelector: args.hostSelector,
        selector: args.selector
      });
      if (!response.ok) {
        return failure(response.message, response.code);
      }
      if (!('shadowQuery' in response)) {
        return failure('Shadow query response is unavailable');
      }
      return ok(
        `Found ${response.shadowQuery.elements.length} shadow DOM elements in ${args.hostSelector}.`,
        { shadowQuery: response.shadowQuery }
      );
    }
  };
}

function ok(summary: string, data: unknown): ToolResult {
  return {
    ok: true,
    code: ERROR_CODES.OK,
    summary,
    data,
    changedPage: false,
    requiresObserve: false,
    context: {
      visibility: 'summary',
      summary
    }
  };
}

function failure(message: string, code: string = ERROR_CODES.OBSERVATION_FAILED): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    error: { message },
    changedPage: false,
    requiresObserve: false,
    context: {
      visibility: 'summary',
      summary: `${code}: ${message}`
    }
  };
}
