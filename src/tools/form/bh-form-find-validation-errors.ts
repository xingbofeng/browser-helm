import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { formFindValidationErrorsPayloadSchema } from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';
import { isToolResult, loadFormToolData, validationErrorFields } from './form-tool-data';

const argsSchema = z.object({});

/**
 * 列出当前校验失败的表单字段。
 *
 * 面向 Form 模式的安全诊断工具，供 Agent 获取浏览器校验或 `aria-invalid` 证据。
 * 不接受参数，不修改字段、不提交表单，永不触发 approval，返回无效字段快照及数量
 * 和警告。
 */
export function bhFormFindValidationErrors(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_form_find_validation_errors',
    // 找出浏览器校验失败或 aria-invalid 的字段，只用于 Form 模式诊断。
    title: 'Find Validation Errors',
    description: 'Finds fields with validation errors',
    ui: {
      titleKey: 'tool.title.bh_form_find_validation_errors',
      descriptionKey: 'tool.description.bh_form_find_validation_errors',
    },
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
