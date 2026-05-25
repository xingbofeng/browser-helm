import type { RunMode } from '../../shared/schemas/tool.schema';
import type { GoalState } from '../../shared/schemas/goal-plan.schema';
import { goalStateSchema } from '../../shared/schemas/goal-plan.schema';

type InitializeGoalInput = {
  task: string;
  mode: RunMode;
  goal?: string;
  successCriteria?: string[];
};

export function initializeGoalState(input: InitializeGoalInput): GoalState {
  const successCriteria =
    input.successCriteria && input.successCriteria.length > 0
      ? input.successCriteria
      : defaultCriteria(input.mode);
  return goalStateSchema.parse({
    goal: input.goal ?? input.task,
    successCriteria,
    satisfiedCriteria: [],
    unsatisfiedCriteria: successCriteria
  });
}

function defaultCriteria(mode: RunMode): string[] {
  if (mode === 'form') {
    return ['列出表单字段状态', '解释缺失字段、校验错误或 disabled submit 原因'];
  }
  if (mode === 'debug') {
    return ['读取页面健康摘要', '解释 console 或 network 异常'];
  }
  if (mode === 'act') {
    return ['完成动作前检查', '说明风险和审批边界'];
  }
  return ['回答用户问题', '说明信息来源和限制'];
}
