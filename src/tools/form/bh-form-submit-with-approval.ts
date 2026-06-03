import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { verifyStatusSchema } from '../../shared/schemas/form-fill.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { toolMeta } from '../core/tool-meta';
import type { ToolSpec } from '../core/tool-spec';
import { buildSubmitApprovalSnapshotDigest } from '../../shared/schemas/approval-snapshot-digest.schema';

const argsSchema = z.object({
  formRefId: z.string().min(1).optional(),
  formName: z.string().min(1),
  submitMethod: z.enum(['button-click', 'enter-submit']),
  submitTargetRefId: z.string().min(1).optional(),
  verifyStatus: verifyStatusSchema,
  verifyFailed: z.boolean(),
  fieldCount: z.number().int().nonnegative(),
  filledCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  riskExplanation: z.string().min(1),
  fields: z.array(z.object({
    fieldRefId: z.string().min(1),
    label: z.string().min(1),
    name: z.string().optional(),
    type: z.string().min(1),
    valuePreview: z.string().min(1),
    isSensitive: z.boolean(),
    skipped: z.boolean().optional(),
  })),
  warnings: z.array(z.string().min(1)),
  /** Optional form identity fields for stale-digest comparison. */
  frameKey: z.string().optional(),
  formAction: z.string().optional(),
  formMethod: z.string().optional(),
});

/**
 * 在实际提交表单前请求用户审批。
 *
 * 高风险 Form 工具——通过返回 APPROVAL_REQUIRED 暂停当前 run。绝不自行提交。
 * 运行时创建审批卡片；仅在用户显式确认后恢复运行。
 *
 * - **运行模式：** form
 * - **读写：** 均不（创建审批请求）
 * - **风险等级：** high
 * - **Approval：** 总是触发
 */
export function bhFormSubmitWithApproval(
  _rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
    // 提交审批。
    ...toolMeta('Submit Form (Approval Required)', 'Requests user approval before submitting a form.', 'tool.title.bh_form_submit_with_approval', 'tool.description.bh_form_submit_with_approval'),
    modes: ['form'],
    risk: 'high',
    argsSchema,
    resultSchema: toolResultSchema,
    execute(args, ctx) {
      const snapshotDigest = buildSubmitApprovalSnapshotDigest({
        formRefId: args.formRefId,
        fieldRefIds: args.fields.map((f) => f.fieldRefId),
        submitTargetRefId: args.submitTargetRefId,
        frameKey: args.frameKey ?? deriveFrameKey([
          ...args.fields.map((f) => f.fieldRefId),
          ...(args.formRefId ? [args.formRefId] : []),
          ...(args.submitTargetRefId ? [args.submitTargetRefId] : [])
        ]),
        formAction: args.formAction,
        formMethod: args.formMethod,
        fields: args.fields
      });

      const payload = {
        runId: ctx.runId,
        stepId: ctx.stepId,
        formRefId: args.formRefId,
        formName: args.formName,
        formAction: args.formAction,
        formMethod: args.formMethod,
        submitMethod: args.submitMethod,
        submitTargetRefId: args.submitTargetRefId,
        verifyStatus: args.verifyStatus,
        verifyFailed: args.verifyFailed,
        fieldCount: args.fieldCount,
        filledCount: args.filledCount,
        skippedCount: args.skippedCount,
        skippedFields: args.fields.filter((field) => field.skipped === true),
        risk: 'high' as const,
        riskExplanation: args.verifyFailed ? `Verification failed, still submitting: ${args.riskExplanation}` : args.riskExplanation,
        highRisk: args.verifyFailed,
        fields: args.fields,
        warnings: args.verifyFailed ? [...args.warnings, 'Verification failed, user chose to submit anyway'] : args.warnings,
        snapshotDigest
      };

      return Promise.resolve({
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUIRED,
        summary: args.verifyFailed ? `High-risk submit confirmation: "${args.formName}"` : `Awaiting approval to submit form "${args.formName}"`,
        data: payload,
        changedPage: false,
        requiresObserve: false,
        requiresApproval: true,
        approval: {
          reason: args.verifyFailed ? `Verification failed, still submitting: ${args.formName}` : `Confirm form submit: ${args.formName}`,
          risk: 'high',
          actionPreview: `Submit form: ${args.formName}`,
        },
      });
    },
  };
}

function deriveFrameKey(refIds: string[]): string | undefined {
  const frameKeys = new Set<string>();
  for (const refId of refIds) {
    const match = /^frame_(\d+):/.exec(refId);
    if (match?.[1]) {
      frameKeys.add(`frame_${match[1]}`);
    }
  }
  return frameKeys.size === 1 ? [...frameKeys][0] : undefined;
}
