import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { fillPlanSchema, type FillPlan } from '../../shared/schemas/form-fill.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';
import {
  formInferFillPlanArgsSchema,
  inferLocalFillPlan,
  type FormInferFillPlanArgs
} from './infer-fill-plan-engine';

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
): ToolSpec<FormInferFillPlanArgs, ToolResult> {
  return {
    name: TOOL_NAMES.FORM_INFER_FILL_PLAN,
    // 根据用户任务推断表单填写方案。
    title: 'Infer Fill Plan',
    description: 'Infers a form fill plan from the user task and field snapshots.',
    risk: 'low',
    ui: {
      titleKey: 'tool.title.bh_form_infer_fill_plan',
      descriptionKey: 'tool.description.bh_form_infer_fill_plan',
    },
    modes: ['form'],
    argsSchema: formInferFillPlanArgsSchema,
    resultSchema: toolResultSchema,
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(args, ctx) {
      const plan = inferLocalFillPlan(args, ctx.locale);
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
