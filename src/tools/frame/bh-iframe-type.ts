import { z } from 'zod';

import { checkResolvedActionReadiness } from '../../page/dom/action-readiness';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { actionValuePreviewSchema } from '../../shared/schemas/action-readiness.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import { approvalRequiredResult } from '../core/tool-result-factory';
import type { ToolSpec } from '../core/tool-spec';
import { parseFrameRef } from './frame-ref';

const argsSchema = z.object({
  refId: z.string().min(1),
  frameId: z.number().int().nonnegative().optional(),
  text: z.string(),
  valuePreview: actionValuePreviewSchema
});

/**
 * Types text into a target inside an iframe after readiness and policy checks.
 *
 * Use this Act-mode prototype for controlled iframe text entry only. It reads
 * the target first, blocks stale/disabled/mismatched refs, masks sensitive
 * previews in visible results, and returns approval-required results before any
 * high-risk mutation. Successful typing marks the page changed and requires a
 * fresh observation.
 */
export function bhIframeType(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_iframe_type',
    // 对 iframe 内文本目标执行受控输入，敏感值只写入 mask preview。
    title: 'Type In Iframe Target',
    description: 'Types into an iframe target after readiness and approval checks',
    modes: ['act'],
    risk: 'high',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const parsed = parseFrameRef(args);
      if (!parsed.ok) {
        return failure(parsed.code, parsed.message, false);
      }
      const read = await rpc.request({
        type: CONTENT_RPC_MESSAGES.IFRAME_READ,
        frameId: parsed.frameId,
        refId: parsed.innerRefId
      });
      if (!read.ok) {
        return failure(read.code, read.message, true, read.detail);
      }
      if (!('ref' in read)) {
        return failure(ERROR_CODES.OBSERVATION_FAILED, 'Content RPC did not return an iframe ref', true);
      }

      const readiness = checkResolvedActionReadiness(
        {
          kind: 'type',
          refId: args.refId,
          source: 'tool',
          valuePreview: args.valuePreview
        },
        normalizeResolvedRef(parsed.innerRefId, read.ref)
      );
      if (!readiness.canAct) {
        return failure(readiness.code, readiness.reason, readiness.requiresObserve);
      }
      if (readiness.wouldRequireApproval) {
        return {
          ...approvalRequiredResult({
            reason: readiness.reason,
            risk: readiness.risk,
            actionPreview: `Type ${args.valuePreview.preview} into ${args.refId}`
          }),
          changedPage: false,
          requiresObserve: false
        };
      }

      const authorized = await rpc.request({
        type: CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
        frameId: parsed.frameId,
        refId: parsed.innerRefId,
        action: 'type'
      });
      if (!authorized.ok) {
        return failure(authorized.code, authorized.message, true, authorized.detail);
      }
      if (!('actionToken' in authorized)) {
        return failure(ERROR_CODES.OBSERVATION_FAILED, 'Content RPC did not authorize iframe action', true);
      }

      const typed = await rpc.request({
        type: CONTENT_RPC_MESSAGES.IFRAME_TYPE,
        frameId: parsed.frameId,
        refId: parsed.innerRefId,
        text: args.text,
        actionToken: authorized.actionToken,
        valuePreview: args.valuePreview
      });
      if (!typed.ok) {
        return failure(typed.code, typed.message, true, typed.detail);
      }

      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Typed ${args.valuePreview.preview} into iframe target ${args.refId}`,
        data: {
          frameId: parsed.frameId,
          refId: args.refId,
          valuePreview: args.valuePreview
        },
        changedPage: true,
        requiresObserve: true,
        nextHints: ['Run bh_page_observe again after iframe type']
      };
    }
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
    requiresObserve
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
    isSensitive: typeof record.isSensitive === 'boolean' ? record.isSensitive : false
  };
}
