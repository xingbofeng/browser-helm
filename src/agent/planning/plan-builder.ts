import type {
  PlanProgressSummary,
  PlanState,
  PlanStep
} from '../../shared/schemas/goal-plan.schema';
import {
  planProgressSummarySchema,
  planStateSchema
} from '../../shared/schemas/goal-plan.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';

type BuildPlanInput = {
  id: string;
  mode: RunMode;
  task: string;
  updatedAt: number;
};

type UpdatePlanForToolResultInput = {
  plan: PlanState;
  tool: string;
  result: ToolResult;
  updatedAt: number;
};

type UpdatePlanForInterruptInput = {
  plan: PlanState;
  reason: string;
  updatedAt: number;
};

type UpdatePlanForRevisedGoalInput = {
  plan: PlanState;
  goal: string;
  updatedAt: number;
};

export function buildPlanState(input: BuildPlanInput): PlanState {
  return planStateSchema.parse({
    id: input.id,
    mode: input.mode,
    steps: templateSteps(input.mode),
    updatedAt: input.updatedAt
  });
}

export function buildPlanProgressSummary(plan: PlanState): PlanProgressSummary {
  return planProgressSummarySchema.parse({
    done: plan.steps
      .filter((step) => step.status === 'done')
      .map((step) => step.title),
    current: plan.steps.find((step) => step.status === 'current')?.title,
    pending: plan.steps
      .filter((step) => step.status === 'pending')
      .map((step) => step.title)
  });
}

export function updatePlanForToolResult(
  input: UpdatePlanForToolResultInput
): PlanState {
  if (input.result.code === 'REF_STALE' || input.result.code === 'PAGE_CHANGED') {
    return planStateSchema.parse({
      ...input.plan,
      steps: input.plan.steps.map((step) =>
        step.id === 'observe'
          ? { ...step, status: 'current', evidence: [input.result.code] }
          : step.status === 'current'
            ? { ...step, status: 'pending' }
            : step
      ),
      updatedAt: input.updatedAt
    });
  }

  const matchedIndex = input.plan.steps.findIndex(
    (step) => step.expectedTool === input.tool
  );
  if (matchedIndex < 0) {
    return planStateSchema.parse({
      ...input.plan,
      updatedAt: input.updatedAt
    });
  }

  const blockedEvidence = blockedReason(input.result);
  return planStateSchema.parse({
    ...input.plan,
    steps: input.plan.steps.map((step, index) => {
      if (index === matchedIndex) {
        return {
          ...step,
          status: blockedEvidence ? 'blocked' : input.result.ok ? 'done' : 'blocked',
          evidence: blockedEvidence ? [blockedEvidence] : [input.result.summary]
        };
      }
      if (index === matchedIndex + 1 && input.result.ok && !blockedEvidence) {
        return {
          ...step,
          status: 'current'
        };
      }
      if (step.status === 'current' && index !== matchedIndex + 1) {
        return {
          ...step,
          status: 'done'
        };
      }
      return step;
    }),
    updatedAt: input.updatedAt
  });
}

export function updatePlanForInterrupt(input: UpdatePlanForInterruptInput): PlanState {
  return planStateSchema.parse({
    ...input.plan,
    steps: input.plan.steps.map((step) =>
      step.status === 'current'
        ? {
            ...step,
            status: 'blocked',
            evidence: [input.reason]
          }
        : step
    ),
    updatedAt: input.updatedAt
  });
}

export function updatePlanForRevisedGoal(
  input: UpdatePlanForRevisedGoalInput
): PlanState {
  return planStateSchema.parse({
    ...input.plan,
    steps: input.plan.steps.map((step, index) => ({
      ...step,
      status: index === 0 ? 'current' : 'pending',
      evidence: index === 0 ? [`目标已修改：${input.goal}`] : undefined
    })),
    updatedAt: input.updatedAt
  });
}

function templateSteps(mode: RunMode): PlanStep[] {
  if (mode === 'form') {
    return [
      step('observe', '观察页面', 'current', 'bh_page_observe'),
      step('read_fields', '读取表单字段', 'pending', 'bh_form_read_fields'),
      step('diagnose', '诊断缺失字段、校验错误和提交状态', 'pending'),
      step('report', '输出表单诊断报告', 'pending')
    ];
  }
  if (mode === 'debug') {
    return [
      step('observe', '观察页面', 'current', 'bh_page_observe'),
      step('page_health', '收集页面健康摘要', 'pending', 'bh_debug_collect_page_health'),
      step('report', '输出页面诊断报告', 'pending')
    ];
  }
  if (mode === 'act') {
    return [
      step('observe', '观察页面', 'current', 'bh_page_observe'),
      step('readiness', '检查动作目标和风险', 'pending', 'bh_action_check_readiness'),
      step('approval_boundary', '说明审批边界', 'pending')
    ];
  }
  return [
    step('observe', '观察页面', 'current', 'bh_page_observe'),
    step('answer', '回答用户问题', 'pending')
  ];
}

function blockedReason(result: ToolResult): string | undefined {
  if (!result.ok) {
    return result.summary;
  }
  const data = result.data;
  if (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    data.status === 'empty'
  ) {
    return '未发现可诊断的表单字段';
  }
  if (
    typeof data === 'object' &&
    data !== null &&
    'count' in data &&
    data.count === 0
  ) {
    return '未发现可诊断的表单字段';
  }
  return undefined;
}

function step(
  id: string,
  title: string,
  status: PlanStep['status'],
  expectedTool?: string
): PlanStep {
  return {
    id,
    title,
    status,
    ...(expectedTool ? { expectedTool } : {})
  };
}
