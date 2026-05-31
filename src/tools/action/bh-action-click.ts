import { z } from 'zod';

import { checkResolvedActionReadiness } from '../../page/dom/action-readiness';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { actionValuePreviewSchema } from '../../shared/schemas/action-readiness.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import { toolMeta } from '../core/tool-meta';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  refId: z.string().min(1),
  source: z.enum(['agent', 'tool', 'runtime']).default('agent'),
  valuePreview: actionValuePreviewSchema.optional()
}).strict();

/**
 * 执行普通点击动作。
 *
 * Act 模式的可变工具，用于点击 observation/ref 映射中的普通按钮或链接。执行前会
 * 解析 stable ref、复用动作就绪检查，并通过 content-script token RPC 执行真实
 * click。会修改页面状态，风险等级为 medium；命中删除、支付、提交、敏感目标等高风险
 * 信号时不会执行，而是要求改走显式 approval 路径。主要参数是 `refId`，可接收
 * 顶层 ref 或 `frame_<id>:ref_<id>` 组合 ref；返回点击摘要、目标 frame/ref 和是否
 * 改变页面。
 */
export function bhActionClick(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.ACTION_CLICK,
    // 对已确认的普通目标执行真实点击。
    ...toolMeta('Click Action', 'Clicks a ready non-high-risk target by stable ref_id; high-risk targets are blocked for approval instead of being clicked', 'tool.title.bh_action_click', 'tool.description.bh_action_click'),
    modes: ['act'],
    risk: 'medium',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const resolved = await rpc.request({
        type: CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF,
        refId: args.refId
      });
      if (!resolved.ok || !('ref' in resolved)) {
        const message = resolved.ok ? 'Content RPC did not return a resolved ref' : resolved.message;
        return failure(resolved.ok ? ERROR_CODES.OBSERVATION_FAILED : resolved.code, message, true);
      }

      const readiness = checkResolvedActionReadiness(
        {
          kind: 'click',
          refId: args.refId,
          source: args.source,
          valuePreview: args.valuePreview
        },
        normalizeResolvedRef(args.refId, resolved.ref)
      );
      if (!readiness.canAct) {
        return {
          ok: false,
          code: readiness.code,
          summary: `${readiness.reason}; click was not executed`,
          data: { readiness },
          error: { message: readiness.reason },
          changedPage: false,
          requiresObserve: readiness.requiresObserve,
          context: {
            visibility: 'summary',
            summary: `${readiness.code}: ${readiness.reason}; click was not executed`
          }
        };
      }
      if (readiness.wouldRequireApproval) {
        return {
          ok: false,
          code: ERROR_CODES.APPROVAL_REQUIRED,
          summary: `${readiness.reason}; click was not executed`,
          data: { readiness },
          error: { message: readiness.reason },
          changedPage: false,
          requiresObserve: false,
          requiresApproval: false,
          nextHints: ['Use an explicit approval flow for high-risk actions before clicking'],
          context: {
            visibility: 'summary',
            summary: `${ERROR_CODES.APPROVAL_REQUIRED}: ${readiness.reason}; click was not executed`
          }
        };
      }

      const target = parseActionTargetRef(args.refId);
      const grant = await rpc.request({
        type: CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
        frameId: target.frameId,
        refId: target.innerRefId,
        action: 'click'
      });
      if (!grant.ok || !('actionToken' in grant)) {
        const message = grant.ok ? 'Click authorization failed' : grant.message;
        return failure(grant.ok ? ERROR_CODES.IFRAME_ACTION_UNAUTHORIZED : grant.code, message, false);
      }
      const clicked = await rpc.request({
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: target.frameId,
        refId: target.innerRefId,
        actionToken: grant.actionToken
      });
      if (!clicked.ok) {
        return failure(clicked.code, clicked.message, true, clicked.detail);
      }
      const changedPage = 'changedPage' in clicked && typeof clicked.changedPage === 'boolean'
        ? clicked.changedPage
        : true;

      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Clicked ${args.refId}`,
        data: {
          frameId: target.frameId,
          refId: args.refId,
          ref: 'ref' in clicked ? clicked.ref : undefined
        },
        changedPage,
        requiresObserve: changedPage,
        context: {
          visibility: 'summary',
          summary: `Clicked ${args.refId}`
        }
      };
    }
  };
}

function parseActionTargetRef(refId: string): { frameId: number; innerRefId: string } {
  const match = /^frame_(\d+):(.+)$/u.exec(refId);
  if (!match?.[1] || !match[2]) {
    return { frameId: 0, innerRefId: refId };
  }
  return {
    frameId: Number(match[1]),
    innerRefId: match[2]
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
    disabled: typeof record.disabled === 'boolean' ? record.disabled : false,
    inputType: typeof record.inputType === 'string' ? record.inputType : undefined,
    autocomplete: typeof record.autocomplete === 'string' ? record.autocomplete : undefined,
    isSensitive: typeof record.isSensitive === 'boolean' ? record.isSensitive : undefined
  };
}

function failure(
  code: string,
  message: string,
  requiresObserve: boolean,
  detail?: unknown
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
