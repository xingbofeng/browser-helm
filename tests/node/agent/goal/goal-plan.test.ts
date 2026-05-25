import { describe, expect, it } from 'vitest';

import { initializeGoalState } from '../../../../src/agent/goal/goal-state';
import {
  updatePlanForInterrupt,
  updatePlanForRevisedGoal,
  updatePlanForToolResult,
  buildPlanProgressSummary,
  buildPlanState
} from '../../../../src/agent/planning/plan-builder';

describe('goal and plan builders', () => {
  it('derives default success criteria for form mode', () => {
    const goal = initializeGoalState({
      task: '帮我看表单为什么不能提交',
      mode: 'form'
    });

    expect(goal.goal).toBe('帮我看表单为什么不能提交');
    expect(goal.successCriteria).toContain('列出表单字段状态');
    expect(goal.unsatisfiedCriteria).toEqual(goal.successCriteria);
  });

  it('keeps user provided success criteria', () => {
    const goal = initializeGoalState({
      task: '检查页面',
      mode: 'debug',
      goal: '找到页面错误',
      successCriteria: ['解释 console error']
    });

    expect(goal.goal).toBe('找到页面错误');
    expect(goal.successCriteria).toEqual(['解释 console error']);
  });

  it('builds mode template plan and progress summary', () => {
    const plan = buildPlanState({
      id: 'plan_1',
      mode: 'debug',
      task: '检查页面错误',
      updatedAt: 1710000000000
    });
    const progress = buildPlanProgressSummary({
      ...plan,
      steps: plan.steps.map((step, index) => ({
        ...step,
        status: index === 0 ? 'done' : index === 1 ? 'current' : 'pending'
      }))
    });

    expect(plan.steps[0]?.title).toContain('观察页面');
    expect(progress.done).toEqual([plan.steps[0]?.title]);
    expect(progress.current).toBe(plan.steps[1]?.title);
  });

  it('marks form diagnosis blocked when the form tool reports an empty form state', () => {
    const plan = buildPlanState({
      id: 'plan_form',
      mode: 'form',
      task: '检查表单',
      updatedAt: 1710000000000
    });

    const updated = updatePlanForToolResult({
      plan,
      tool: 'bh_form_read_fields',
      result: {
        ok: true,
        code: 'OK',
        summary: 'Read 0 fields',
        data: {
          status: 'empty',
          fields: [],
          count: 0,
          warnings: []
        }
      },
      updatedAt: 1710000001000
    });

    expect(updated.steps.find((step) => step.id === 'read_fields')?.status).toBe(
      'blocked'
    );
    expect(updated.steps.find((step) => step.id === 'read_fields')?.evidence).toContain(
      '未发现可诊断的表单字段'
    );
  });

  it('moves back to observation when a stale ref recovery is requested', () => {
    const plan = buildPlanState({
      id: 'plan_form',
      mode: 'form',
      task: '检查表单',
      updatedAt: 1710000000000
    });

    const updated = updatePlanForToolResult({
      plan,
      tool: 'bh_form_read_fields',
      result: {
        ok: false,
        code: 'REF_STALE',
        summary: 'ref is stale'
      },
      updatedAt: 1710000001000
    });

    expect(updated.steps.find((step) => step.id === 'observe')?.status).toBe(
      'current'
    );
    expect(updated.steps.find((step) => step.id === 'observe')?.evidence).toContain(
      'REF_STALE'
    );
  });

  it('updates plan for interrupt and revised goal', () => {
    const plan = buildPlanState({
      id: 'plan_form',
      mode: 'form',
      task: '检查表单',
      updatedAt: 1710000000000
    });
    const interrupted = updatePlanForInterrupt({
      plan,
      reason: 'user_cancelled',
      updatedAt: 1710000001000
    });
    const revised = updatePlanForRevisedGoal({
      plan: interrupted,
      goal: '改为检查页面错误',
      updatedAt: 1710000002000
    });

    expect(interrupted.steps.find((step) => step.status === 'blocked')?.evidence)
      .toContain('user_cancelled');
    expect(revised.steps[0]?.status).toBe('current');
    expect(revised.steps[0]?.evidence).toContain('目标已修改：改为检查页面错误');
  });
});
