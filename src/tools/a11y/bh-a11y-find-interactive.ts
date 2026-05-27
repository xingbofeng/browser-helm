import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import {
  interactiveElementSchema,
  interactiveFindPayloadSchema,
  type InteractiveElement
} from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

/**
 * 返回当前页面可交互元素的只读列表。
 *
 * 面向 Debug/Form 模式的安全工具，供 Agent 在 observation 后获取 ref、role、name、
 * visibility、disabled、selection 等状态，用于动作规划或表单诊断。不接受参数，不修改
 * 页面状态，永不触发 approval，返回交互元素载荷及紧凑上下文摘要。
 */
export function bhA11yFindInteractive(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_a11y_find_interactive',
    // 读取当前页面可交互元素列表，供 Debug/Form 模式诊断页面结构。
    title: 'Find Interactive Elements',
    description: 'Returns read-only interactive elements with refs and state',
    modes: ['debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
      if (!response.ok) {
        return failure(response.code, response.message, response.detail, true);
      }
      if (!('snapshot' in response)) {
        return failure(
          ERROR_CODES.OBSERVATION_FAILED,
          'Content RPC did not return an a11y snapshot',
          undefined,
          true
        );
      }

      const elements = normalizeElements(response.snapshot.elements ?? []);
      const payload = interactiveFindPayloadSchema.parse({
        status: elements.length > 0 ? 'ready' : 'empty',
        elements,
        count: elements.length,
        warnings: response.snapshot.warnings ?? []
      });
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary:
          elements.length > 0
            ? `Found ${elements.length} interactive elements`
            : 'No interactive elements found',
        data: payload,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: `interactive=${elements.length}`
        }
      };
    }
  };
}

function normalizeElements(elements: unknown[]): InteractiveElement[] {
  return elements.map((element, index) => {
    const value =
      typeof element === 'object' && element !== null
        ? (element as Record<string, unknown>)
        : {};
    return interactiveElementSchema.parse({
      ...value,
      disabled: value.disabled ?? false,
      domOrder: value.domOrder ?? index,
      warnings: value.warnings ?? []
    });
  });
}

function failure(
  code: string,
  message: string,
  detail: unknown,
  requiresObserve: boolean
): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    error: { message, detail },
    changedPage: false,
    requiresObserve,
    context: {
      visibility: 'summary',
      summary: `${code}: ${message}`
    }
  };
}
