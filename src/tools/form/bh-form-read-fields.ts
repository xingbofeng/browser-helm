import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { formReadFieldsPayloadSchema } from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';
import { isToolResult, loadFormToolData } from './form-tool-data';

const argsSchema = z.object({});

/**
 * Reads current form field snapshots.
 *
 * Use this safe Debug/Form tool when the Agent needs labels, names, types,
 * required flags, masked value previews, and validation state. It accepts no
 * parameters, never writes page state, never triggers approval, and returns the
 * field list, count, submit summary, and warnings.
 */
export function bhFormReadFields(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_form_read_fields',
    // 读取当前页面字段快照，返回 label/type/required/valuePreview/validation。
    title: 'Read Form Fields',
    description: 'Reads form field snapshots',
    modes: ['debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const data = await loadFormToolData(rpc);
      if (isToolResult(data)) return data;
      const payload = formReadFieldsPayloadSchema.parse({
        status: data.status,
        fields: data.fields,
        count: data.fields.length,
        submit: data.submit,
        warnings: data.warnings
      });
      return { ok: true, code: ERROR_CODES.OK, summary: `Read ${data.fields.length} fields`, data: payload, changedPage: false, requiresObserve: false };
    }
  };
}
