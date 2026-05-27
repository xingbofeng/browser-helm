import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { verifyStatusSchema } from '../../shared/schemas/form-fill.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

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
    title: 'Submit Form (Approval Required)',
    description: 'Requests user approval before submitting a form.',
    modes: ['form'],
    risk: 'high',
    argsSchema,
    resultSchema: toolResultSchema,
		// eslint-disable-next-line @typescript-eslint/require-await
		async execute(args) {
      const payload = {
        formRefId: args.formRefId,
        formName: args.formName,
        submitMethod: args.submitMethod,
        submitTargetRefId: args.submitTargetRefId,
        verifyStatus: args.verifyStatus,
        verifyFailed: args.verifyFailed,
        fieldCount: args.fieldCount,
        filledCount: args.filledCount,
        skippedCount: args.skippedCount,
        risk: 'high' as const,
        riskExplanation: args.verifyFailed ? `Verification failed, still submitting: ${args.riskExplanation}` : args.riskExplanation,
        highRisk: args.verifyFailed,
        fields: args.fields,
        warnings: args.verifyFailed ? [...args.warnings, 'Verification failed, user chose to submit anyway'] : args.warnings,
      };

      return {
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
      };
    },
  };
}
