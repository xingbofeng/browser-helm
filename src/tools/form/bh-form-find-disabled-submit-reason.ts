import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { formFindDisabledSubmitReasonPayloadSchema } from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';
import { disabledSubmitReason, isToolResult, loadFormToolData } from './form-tool-data';

const argsSchema = z.object({});

export function bhFormFindDisabledSubmitReason(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_form_find_disabled_submit_reason',
    // 读取 disabled submit 的 confirmed/inferred/unknown 原因，只用于 Form 模式。
    title: 'Find Disabled Submit Reason',
    description: 'Finds the reason a submit button is disabled',
    modes: ['form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const data = await loadFormToolData(rpc);
      if (isToolResult(data)) return data;
      const reason = disabledSubmitReason(data);
      const payload = formFindDisabledSubmitReasonPayloadSchema.parse({
        submit: data.submit,
        reason,
        warnings: data.warnings
      });
      return { ok: true, code: ERROR_CODES.OK, summary: `Disabled submit reason: ${reason.kind}`, data: payload, changedPage: false, requiresObserve: false };
    }
  };
}
