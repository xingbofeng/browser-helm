import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { fillPlanSchema, type FillPlan, type FillTarget } from '../../shared/schemas/form-fill.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  userTask: z.string().min(1),
  formSummary: z.string().min(1),
  formRefId: z.string().min(1).optional(),
  fields: z.array(z.object({
    refId: z.string().min(1),
    label: z.string().optional(),
    name: z.string().optional(),
    type: z.string().min(1),
    required: z.boolean().optional(),
    disabled: z.boolean().optional(),
    sensitive: z.boolean().optional(),
    valuePreview: z.string().optional(),
    placeholder: z.string().optional(),
    ariaLabel: z.string().optional(),
  })),
});

/**
 * 根据用户任务和字段快照推断表单填写方案。
 *
 * 纯推断 Form 工具，绝不触碰 DOM。对每个字段应用 label/type/placeholder 启发式规则
 * 与用户任务进行匹配，建议 value、source、confidence 和 reason。sensitive、
 * disabled、hidden 和 file-upload 字段列为 skipped。
 *
 * - **运行模式：** form
 * - **读写：** 只读（仅推断）
 * - **风险等级：** low
 * - **Approval：** 永不触发
 */
export function bhFormInferFillPlan(
  _rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.FORM_INFER_FILL_PLAN,
    // 根据用户任务推断表单填写方案。
    title: 'Infer Fill Plan',
    description: 'Infers a form fill plan from the user task and field snapshots.',
    modes: ['form'],
    risk: 'low',
    argsSchema,
    resultSchema: toolResultSchema,
		// eslint-disable-next-line @typescript-eslint/require-await
		async execute(args) {
      const plan = inferPlan(args);
      const parsed = fillPlanSchema.parse(plan);
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Inferred fill for ${parsed.fields.length} fields, skipped ${parsed.skippedFields.length}`,
        data: parsed satisfies FillPlan,
        changedPage: false,
        requiresObserve: false,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 推断引擎
// ---------------------------------------------------------------------------

interface FieldInput {
  refId: string;
  label?: string | undefined;
  name?: string | undefined;
  type: string;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  sensitive?: boolean | undefined;
  valuePreview?: string | undefined;
  placeholder?: string | undefined;
  ariaLabel?: string | undefined;
}

function inferPlan(args: z.infer<typeof argsSchema>): FillPlan {
  const targets: FillTarget[] = [];
  const skipped: FillPlan['skippedFields'] = [];
  const task = args.userTask.toLowerCase();

  for (const field of args.fields) {
    if (field.disabled) {
      skipped.push({ fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, reason: '字段已禁用' });
      continue;
    }
    if (field.sensitive) {
      skipped.push({ fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, reason: '敏感字段，跳过自动填写' });
      continue;
    }
    if (field.type === 'file' || field.type === 'hidden') {
      skipped.push({ fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, reason: field.type === 'file' ? '不支持文件上传' : '隐藏字段不安全' });
      continue;
    }

    const t = inferField(field, task);
    if (t.skipReason) {
      skipped.push({ fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, reason: t.skipReason });
    }
    targets.push(t);
  }

  return { formRefId: args.formRefId, formSummary: args.formSummary, userTask: args.userTask, fields: targets, skippedFields: skipped };
}

function mk(field: FieldInput, value: string | undefined, source: FillTarget['source'], confidence: FillTarget['confidence'], reason: string, skipReason?: string  ): FillTarget {
  return { fieldRefId: field.refId, label: field.label, name: field.name, type: field.type, requestedValue: value, source, confidence, reason, maskedValuePreview: skipReason ? '(跳过)' : value ? mask(value) : '(清空)', ...(skipReason ? { skipReason } : {}) };
}

function inferField(field: FieldInput, task: string): FillTarget {
  const combined = [field.label ?? '', field.name ?? '', field.placeholder ?? '', field.ariaLabel ?? ''].join(' ').toLowerCase();

  if (field.type === 'checkbox') {
    const want = /勾|选|同意|接受|订阅|全选|check|agree|accept|subscribe|select all/i.test(combined + task);
    return mk(field, want ? 'true' : 'false', want ? 'label-match' : 'default', want ? 'medium' : 'high', want ? `标签匹配: 勾选 ${field.label ?? field.name}` : '保持默认不勾选');
  }

  if (field.type === 'radio' || field.type === 'select-one' || field.type === 'select' || field.type === 'select-multiple') {
    return mk(field, undefined, 'empty', 'low', '需要选项信息，跳过', '需要选项信息');
  }

  if (/date|日期|出生/.test(combined)) {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return mk(field, iso, 'default', 'medium', '默认填写今天日期');
  }

  if (/time|时间/.test(combined)) {
    return mk(field, '12:00', 'default', 'low', '默认填写中午 12:00');
  }

  if (/email|e-?mail|邮箱|邮件/.test(combined)) {
    const m = task.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return mk(field, m ? m[0] : 'user@example.com', 'label-match', m ? 'high' : 'medium', m ? '从用户任务中提取 email' : '标签匹配 email，填默认值');
  }

  if (/phone|tel|mobile|电话|手机|号/.test(combined)) {
    const p = task.match(/\d[\d\s\-()]{6,}/);
    return mk(field, p ? p[0] : '13800138000', 'label-match', 'medium', '标签匹配 phone/tel');
  }

  if (field.type === 'number') {
    return mk(field, '1', 'default', 'low', '默认填写 1');
  }

  if (/url|网址|链接|website/.test(combined)) {
    return mk(field, 'https://example.com', 'default', 'low', '默认填写示例 URL');
  }

  if (/search|搜索|查找/.test(combined)) {
    return mk(field, task.slice(0, 50), 'user-task', 'medium', '从用户任务提取搜索词');
  }

  if (field.placeholder && field.placeholder.length > 0) {
    return mk(field, field.placeholder, 'placeholder-match', 'medium', `使用 placeholder "${field.placeholder}"`);
  }

  return mk(field, '', 'empty', 'low', '无法推断值', '无法推断值');
}

function mask(value: string): string {
  if (value.length <= 3) return '***';
  return value.slice(0, 3) + '***' + value.slice(-2);
}
