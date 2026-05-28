import { z } from 'zod';

import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { formVerifyResultSchema, type FormVerifyResult } from '../../shared/schemas/form-fill.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { toolMeta } from '../core/tool-meta';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  formRefId: z.string().min(1).optional(),
  submitRefId: z.string().min(1).optional(),
  fieldRefIds: z.array(z.string().min(1)),
});

/**
 * 在提交前验证表单就绪状态。
 *
 * Form/Debug 只读工具，检查 HTML5 校验、必填字段、aria-invalid、可见错误文本、
 * submit 按钮状态及实际 DOM 值。返回 pass/fail/warn 及字段级证据。
 *
 * - **运行模式：** form, debug
 * - **读写：** 只读
 * - **风险等级：** low
 * - **Approval：** 永不触发
 */
export function bhFormVerify(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.FORM_VERIFY,
    // 验证表单准备状态。
    ...toolMeta('Verify Form', 'Verifies form readiness before submit.', 'tool.title.bh_form_verify', 'tool.description.bh_form_verify'),
    modes: ['form', 'debug'],
    risk: 'low',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const resp = await rpc.request({
        type: CONTENT_RPC_MESSAGES.FORM_VERIFY,
        fieldRefIds: args.fieldRefIds,
        submitRefId: args.submitRefId,
      });

      if (!resp.ok) {
        return { ok: false, code: resp.code ?? ERROR_CODES.TOOL_EXECUTION_FAILED, summary: 'verify failed', error: { message: 'verify failed' }, changedPage: false, requiresObserve: false };
      }

      if (!('verifyResult' in resp)) {
        return { ok: false, code: ERROR_CODES.TOOL_EXECUTION_FAILED, summary: 'unexpected RPC response', error: { message: 'unexpected RPC response' }, changedPage: false, requiresObserve: false };
      }
      const result: FormVerifyResult = formVerifyResultSchema.parse(resp.verifyResult);
      return { ok: true, code: ERROR_CODES.OK, summary: result.status === 'pass' ? 'Form verification passed' : `Form verification failed: ${result.missingRequired.length} required fields missing`, data: result, changedPage: false, requiresObserve: false };
    },
  };
}
