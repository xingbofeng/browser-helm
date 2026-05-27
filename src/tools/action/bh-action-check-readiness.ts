import type { z } from 'zod';

import { checkResolvedActionReadiness } from '../../page/dom/action-readiness';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import {
  actionIntentSchema,
  actionReadinessSchema
} from '../../shared/schemas/action-readiness.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = actionIntentSchema;

/**
 * 检查拟执行的浏览器动作是否具备有效目标和安全状态。
 *
 * 面向 Debug/Act 模式的只读工具，在尝试受控 iframe/page 动作之前使用。解析目标
 * stable ref，报告动作能否执行、预测风险/approval 需求，并告知 Agent 何时需要重新
 * 观察页面。工具本身不修改页面，也不自行创建 ApprovalRequest。
 */
export function bhActionCheckReadiness(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_action_check_readiness',
    // 检查拟执行动作的目标、风险和重新观察需求，不实际修改页面。
    title: 'Check Action Readiness',
    description: 'Checks whether a proposed action is ready and whether it would require approval',
    modes: ['debug', 'act'],
    risk: 'low',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const response = await rpc.request({
        type: CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF,
        refId: args.refId
      });
      const readiness = response.ok && 'ref' in response
        ? checkResolvedActionReadiness(args, normalizeResolvedRef(args.refId, response.ref))
        : unresolvedReadiness(args, response);

      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: readiness.reason,
        data: actionReadinessSchema.parse(readiness),
        changedPage: false,
        requiresObserve: readiness.requiresObserve,
        context: {
          visibility: 'summary',
          summary: `${readiness.code}: ${readiness.reason}`
        }
      };
    }
  };
}

function normalizeResolvedRef(refId: string, ref: unknown) {
  const record = (typeof ref === 'object' && ref !== null ? ref : {}) as Record<
    string,
    unknown
  >;
  return {
    refId,
    role: typeof record.role === 'string' ? record.role : undefined,
    name: typeof record.name === 'string' ? record.name : undefined,
    tagName: typeof record.tagName === 'string' ? record.tagName : 'unknown',
    visible: typeof record.visible === 'boolean' ? record.visible : false,
    disabled: typeof record.disabled === 'boolean' ? record.disabled : false
  };
}

function unresolvedReadiness(
  args: z.infer<typeof argsSchema>,
  response: Awaited<ReturnType<ContentRpcClient['request']>>
) {
  const code = response.ok ? ERROR_CODES.OBSERVATION_FAILED : response.code;
  const message = response.ok
    ? 'Content RPC did not return a resolved ref'
    : response.message;
  return {
    canAct: false,
    code,
    reason: message,
    risk: args.kind === 'submit' ? 'high' as const : 'medium' as const,
    staleRefs: code === ERROR_CODES.REF_STALE,
    changedPage: false,
    requiresObserve: true,
    wouldRequireApproval: false,
    nextHints: ['Run bh_page_observe again']
  };
}
