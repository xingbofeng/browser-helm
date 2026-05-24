import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { formListPayloadSchema } from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';
import { isToolResult, loadFormToolData } from './form-tool-data';

const argsSchema = z.object({});

export function bhFormList(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_form_list',
    // 列出当前页面表单概览，供 Debug/Form 模式快速判断字段数量和 submit 状态。
    title: 'List Forms',
    description: 'Lists detected forms and field counts',
    modes: ['debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const data = await loadFormToolData(rpc);
      if (isToolResult(data)) return data;
      const payload = formListPayloadSchema.parse({
        status: data.status,
        forms: [
          {
            fieldCount: data.fields.length,
            submit: data.submit
          }
        ],
        count: data.fields.length > 0 ? 1 : 0,
        warnings: data.warnings
      });
      return ok(ERROR_CODES.OK, `Detected ${payload.count} forms`, payload);
    }
  };
}

function ok(code: string, summary: string, data: unknown): ToolResult {
  return { ok: true, code, summary, data, changedPage: false, requiresObserve: false };
}
