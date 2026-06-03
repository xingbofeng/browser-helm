import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ShadowElementSummary, ShadowQueryResult, ShadowRootSummary } from '../../shared/schemas/shadow';
import type { ToolSpec } from '../core/tool-spec';

const emptyArgsSchema = z.object({}).strict();
const queryArgsSchema = z.object({
  hostSelector: z.string().min(1),
  selector: z.string().min(1)
}).strict();
const MAX_SHADOW_QUERY_ELEMENTS = 50;
const MAX_SHADOW_TEXT_CHARS = 80;

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
      return ok(summarizeShadowRoots(response.shadowRoots), { shadowRoots: response.shadowRoots });
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
      const shadowQuery = compactShadowQuery(response.shadowQuery);
      return ok(summarizeShadowQuery(shadowQuery), { shadowQuery });
    }
  };
}

function summarizeShadowRoots(roots: ShadowRootSummary[]): string {
  const preview = roots.slice(0, 10).map((root) => {
    const parts = [
      `host=${root.hostSelector}`,
      `tag=${root.hostTagName}`,
      `interactive=${root.interactiveCount}`
    ];
    if (root.textPreview) {
      parts.push(`text=${truncate(root.textPreview, 120)}`);
    }
    return parts.join(' ');
  }).join('; ');
  return preview
    ? `Found ${roots.length} open shadow roots: ${preview}`
    : 'Found 0 open shadow roots.';
}

function summarizeShadowQuery(result: ShadowQueryResult): string {
  const preview = result.elements.slice(0, 20).map(formatShadowElement).join('; ');
  const omitted = readOmittedCount(result);
  return preview
    ? `Found ${result.elements.length} shadow DOM elements in ${result.hostSelector}${omitted > 0 ? ` (omitted=${omitted})` : ''}: ${preview}`
    : `Found 0 shadow DOM elements in ${result.hostSelector}.`;
}

function formatShadowElement(element: ShadowElementSummary): string {
  const parts = [
    `tag=${element.tagName}`,
    `name=${element.name || 'unnamed'}`
  ];
  if (element.role) {
    parts.push(`role=${element.role}`);
  }
  if (element.text) {
    parts.push(`text=${truncate(element.text, 120)}`);
  }
  return parts.join(' ');
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function compactShadowQuery(result: ShadowQueryResult): ShadowQueryResult & { omittedCount?: number } {
  const elements = result.elements.slice(0, MAX_SHADOW_QUERY_ELEMENTS).map((element) => ({
    ...element,
    ...(element.text ? { text: truncate(element.text, MAX_SHADOW_TEXT_CHARS) } : {})
  }));
  return {
    ...result,
    elements,
    ...(result.elements.length > MAX_SHADOW_QUERY_ELEMENTS
      ? { omittedCount: result.elements.length - MAX_SHADOW_QUERY_ELEMENTS }
      : {})
  };
}

function readOmittedCount(result: ShadowQueryResult): number {
  const count = (result as { omittedCount?: unknown }).omittedCount;
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
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
