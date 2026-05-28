import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { formInspectPayloadSchema } from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';
import { toolMeta } from '../core/tool-meta';
import { isToolResult, loadFormToolData } from './form-tool-data';

const argsSchema = z.object({
  formRefId: z.string().min(1).optional()
});

/**
 * 检查当前表单字段和 submit 状态。
 *
 * 面向 Debug/Form 模式的安全只读工具，提供表单概览。可选 `formRefId` 在可用时限定
 * 返回载荷范围；该工具不填写、不点击、不提交，永不触发 approval，返回字段、
 * submit 诊断及警告。
 */
export function bhFormInspect(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_form_inspect',
    // 检查当前表单字段和 submit 摘要，不执行填写或提交。
    ...toolMeta('Inspect Form', 'Inspects form fields and submit state', 'tool.title.bh_form_inspect', 'tool.description.bh_form_inspect'),
    modes: ['debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const data = await loadFormToolData(rpc);
      if (isToolResult(data)) return data;
      const payload = formInspectPayloadSchema.parse({
        formRefId: args.formRefId,
        fields: data.fields,
        submit: data.submit,
        warnings: data.warnings
      });
      return { ok: true, code: ERROR_CODES.OK, summary: 'Inspected form', data: payload, changedPage: false, requiresObserve: false };
    }
  };
}
