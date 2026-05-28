import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { formListPayloadSchema } from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';
import { isToolResult, loadFormToolData } from './form-tool-data';

const argsSchema = z.object({});

/**
 * 列出检测到的表单组及 submit 高层次状态。
 *
 * 面向 Debug/Form 模式的安全工具，用于判断页面是否包含值得检查的表单数据。不接受
 * 参数，不修改页面状态，永不触发 approval，返回表单数量、字段数量、submit 摘要及
 * 警告。
 */
export function bhFormList(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_form_list',
    // 列出当前页面表单概览，供 Debug/Form 模式快速判断字段数量和 submit 状态。
    title: 'List Forms',
    description: 'Lists detected forms and field counts',
    ui: {
      titleKey: 'tool.title.bh_form_list',
      descriptionKey: 'tool.description.bh_form_list',
    },
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
