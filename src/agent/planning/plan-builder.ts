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
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';

type BuildPlanInput = {
  id: string;
  mode: RunMode;
  task: string;
  updatedAt: number;
  locale?: Locale;
};

type UpdatePlanForToolResultInput = {
  plan: PlanState;
  tool: string;
  result: ToolResult;
  updatedAt: number;
  locale?: Locale;
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
  locale?: Locale;
};

export function buildPlanState(input: BuildPlanInput): PlanState {
  const locale = input.locale ?? 'zh';
  return planStateSchema.parse({
    id: input.id,
    mode: input.mode,
    steps: templateSteps(input.mode, locale),
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

  const locale = input.locale ?? 'zh';
  const blockedEvidence = blockedReason(input.result, locale);
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
      evidence: index === 0 ? [t('plan.evidence.goalRevised', input.locale ?? 'zh', { goal: input.goal })] : undefined
    })),
    updatedAt: input.updatedAt
  });
}

function templateSteps(mode: RunMode, locale: Locale): PlanStep[] {
  if (mode === 'form') {
    return [
      step('observe', t('plan.step.observe', locale), 'current', 'bh_page_observe'),
      step('read_fields', t('plan.step.readFields', locale), 'pending', 'bh_form_read_fields'),
      step('diagnose', t('plan.step.diagnose', locale), 'pending'),
      step('report', t('plan.step.reportForm', locale), 'pending')
    ];
  }
  if (mode === 'debug') {
    return [
      step('observe', t('plan.step.observe', locale), 'current', 'bh_page_observe'),
      step('page_health', t('plan.step.collectPageHealth', locale), 'pending', 'bh_debug_collect_page_health'),
      step('report', t('plan.step.reportPage', locale), 'pending')
    ];
  }
  if (mode === 'act') {
    return [
      step('observe', t('plan.step.observe', locale), 'current', 'bh_page_observe'),
      step('readiness', t('plan.step.checkReadiness', locale), 'pending', 'bh_action_check_readiness'),
      step('approval_boundary', t('plan.step.explainApproval', locale), 'pending')
    ];
  }
  return [
    step('observe', t('plan.step.observe', locale), 'current', 'bh_page_observe'),
    step('answer', t('plan.step.answer', locale), 'pending')
  ];
}

function blockedReason(result: ToolResult, locale: Locale): string | undefined {
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
    return t('plan.blocked.noFormFields', locale);
  }
  if (
    typeof data === 'object' &&
    data !== null &&
    'count' in data &&
    data.count === 0
  ) {
    return t('plan.blocked.noFormFields', locale);
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
