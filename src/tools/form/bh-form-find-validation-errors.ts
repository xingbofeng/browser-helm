import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { formFindValidationErrorsPayloadSchema } from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';
import { isToolResult, loadFormToolData, validationErrorFields } from './form-tool-data';

const argsSchema = z.object({});

export function bhFormFindValidationErrors(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_form_find_validation_errors',
    // 找出浏览器校验失败或 aria-invalid 的字段，只用于 Form 模式诊断。
    title: 'Find Validation Errors',
    description: 'Finds fields with validation errors',
    modes: ['form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const data = await loadFormToolData(rpc);
      if (isToolResult(data)) return data;
      const fields = validationErrorFields(data.fields);
      const payload = formFindValidationErrorsPayloadSchema.parse({
        fields,
        count: fields.length,
        warnings: data.warnings
      });
      return { ok: true, code: ERROR_CODES.OK, summary: `Found ${fields.length} validation errors`, data: payload, changedPage: false, requiresObserve: false };
    }
  };
}
