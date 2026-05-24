import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { formFindMissingRequiredPayloadSchema } from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';
import { isToolResult, loadFormToolData, missingRequiredFields } from './form-tool-data';

const argsSchema = z.object({});

export function bhFormFindMissingRequired(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_form_find_missing_required',
    // 找出 required 但当前值为空的字段，只用于 Form 模式诊断。
    title: 'Find Missing Required Fields',
    description: 'Finds required fields with empty previews',
    modes: ['form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const data = await loadFormToolData(rpc);
      if (isToolResult(data)) return data;
      const fields = missingRequiredFields(data.fields);
      const payload = formFindMissingRequiredPayloadSchema.parse({
        fields,
        count: fields.length,
        warnings: data.warnings
      });
      return { ok: true, code: ERROR_CODES.OK, summary: `Found ${fields.length} missing required fields`, data: payload, changedPage: false, requiresObserve: false };
    }
  };
}
