import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { a11ySnapshotSchema } from '../../shared/schemas/observation.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

/**
 * 捕获当前页面的 a11y-like 快照及 stable refs。
 *
 * 面向 Ask/Debug/Form 模式的安全只读工具，作为底层页面结构读取入口。不接受参数，
 * 不修改页面状态，永不触发 approval，返回有界的快照及紧凑摘要，适于 Agent 上下文。
 */
export function bhA11ySnapshot(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_a11y_snapshot',
    // 捕获当前页面的 a11y-like 快照，并为可交互候选生成 stable refs。
    title: 'A11y Snapshot',
    description: 'Returns an accessibility-like snapshot with stable refs',
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
      if (!response.ok) {
        return failure(response.code, response.message, response.detail);
      }
      if (!('snapshot' in response)) {
        return failure(
          ERROR_CODES.OBSERVATION_FAILED,
          'Content RPC did not return an a11y snapshot'
        );
      }
      const snapshot = a11ySnapshotSchema.parse(response.snapshot);
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Captured ${snapshot.elements.length} interactive refs`,
        data: snapshot,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: `refs=${snapshot.elements.length}, origin=${snapshot.origin ?? 'unknown'}`
        }
      };
    }
  };
}

function failure(code: string, message: string, detail?: unknown): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    error: { message, detail },
    changedPage: false,
    requiresObserve: true,
    context: {
      visibility: 'summary',
      summary: `${code}: ${message}`
    }
  };
}
