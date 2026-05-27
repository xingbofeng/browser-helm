import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { formReadFieldsPayloadSchema } from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';
import { isToolResult, loadFormToolData } from './form-tool-data';

const argsSchema = z.object({});

/**
 * 读取当前表单字段快照。
 *
 * 面向 Debug/Form 模式的安全工具，供 Agent 获取 label、name、type、required 标志、
 * masked value preview 和 validation 状态。不接受参数，不写入页面状态，永不触发
 * approval，返回字段列表、数量、submit 摘要及警告。
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
