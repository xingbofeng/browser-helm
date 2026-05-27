import { describe, expect, it } from 'vitest';

import {
  taskClassificationSchema,
  toolSelectionSchema
} from '../../../../src/shared/schemas/mode-system.schema';
import {
  agentFindingSchema,
  debugReportSchema
} from '../../../../src/shared/schemas/diagnosis.schema';
import {
  goalStateSchema,
  planProgressSummarySchema,
  planStateSchema
} from '../../../../src/shared/schemas/goal-plan.schema';
import {
  recoveryActionSchema,
  recoveryStateSchema
} from '../../../../src/shared/schemas/recovery.schema';
import { runtimeCapabilitiesSchema } from '../../../../src/shared/schemas/runtime-capabilities.schema';
import { pageHealthSummarySchema } from '../../../../src/shared/schemas/page-health.schema';

describe('diagnosis schemas', () => {
  it('accepts task classification with reason and matched signals', () => {
    const parsed = taskClassificationSchema.parse({
      mode: 'form',
      taskType: 'form',
      reason: '用户询问表单为什么不能提交',
      confidence: 'high',
      matchedSignals: ['表单', '不能提交']
    });

    expect(parsed.mode).toBe('form');
    expect(parsed.matchedSignals).toContain('不能提交');
  });

  it('accepts selected tools with limitations', () => {
    const parsed = toolSelectionSchema.parse({
      mode: 'debug',
      visibleTools: ['bh_page_observe', 'bh_debug_collect_page_health'],
      hiddenTools: [
        {
          tool: 'bh_cdp_get_response_body',
          reason: 'CDP capability is reserved for future release'
        }
      ],
      limitations: ['Debugger/CDP is unavailable']
    });

    expect(parsed.visibleTools).toContain('bh_debug_collect_page_health');
    expect(parsed.hiddenTools[0]?.tool).toBe('bh_cdp_get_response_body');
  });

  it('accepts findings and DebugReport with evidence and limitations', () => {
    const finding = agentFindingSchema.parse({
      title: '提交按钮不可用',
      explanation: '表单缺少必填邮箱字段，因此提交按钮保持 disabled。',
      evidence: [
        {
          source: 'form',
          summary: 'Email 字段 required 且 empty',
          refId: 'ref_12'
        }
      ],
      confidence: 'high'
    });
    const report = debugReportSchema.parse({
      title: '表单诊断报告',
      findings: [finding],
      recommendations: ['填写 Email 字段后重新检查'],
      limitations: ['未读取 response body，浅层诊断能力有限']
    });

    expect(report.findings[0]?.confidence).toBe('high');
    expect(report.limitations?.[0]).toContain('浅层诊断');
  });

  it('accepts goal state and plan progress summary', () => {
    const goal = goalStateSchema.parse({
      goal: '解释表单为什么不能提交',
      successCriteria: ['列出缺失字段', '解释 disabled submit 原因'],
      satisfiedCriteria: ['列出缺失字段'],
      unsatisfiedCriteria: ['解释 disabled submit 原因']
    });
    const plan = planStateSchema.parse({
      id: 'plan_1',
      mode: 'form',
      steps: [
        {
          id: 'observe',
          title: '观察页面',
          status: 'done',
          expectedTool: 'bh_page_observe',
          evidence: ['evt_1']
        },
        {
          id: 'diagnose',
          title: '诊断表单',
          status: 'current'
        }
      ],
      updatedAt: 1710000000000
    });
    const progress = planProgressSummarySchema.parse({
      done: ['观察页面'],
      current: '诊断表单',
      pending: ['输出报告']
    });

    expect(goal.satisfiedCriteria).toHaveLength(1);
    expect(plan.steps[1]?.status).toBe('current');
    expect(progress.current).toBe('诊断表单');
  });

  it('accepts recovery state and runtime capabilities', () => {
    const action = recoveryActionSchema.parse({
      type: 're_observe',
      reason: 'REF_STALE'
    });
    const recovery = recoveryStateSchema.parse({
      action,
      attempts: 1,
      budgetRemaining: 0,
      limitation: 'REF_STALE recovery already attempted'
    });
    const capabilities = runtimeCapabilitiesSchema.parse({
      hasActiveTab: true,
      hasDebuggerPermission: false,
      hasClipboardPermission: false,
      hasDownloadsPermission: false,
      hostPermissions: ['https://example.com/*'],
      shallowDebugAvailable: true,
      cdp: 'reserved'
    });

    expect(recovery.action.type).toBe('re_observe');
    expect(capabilities.cdp).toBe('reserved');
  });

  it('accepts page health summary without CDP data', () => {
    const parsed = pageHealthSummarySchema.parse({
      consoleErrors: [
        {
          message: 'Uncaught TypeError',
          count: 1
        }
      ],
      networkFailures: [
        {
          url: 'https://api.example.com/users',
          method: 'GET',
          errorText: 'Failed to fetch'
        }
      ],
      hasForm: true,
      pageStateSummary: '页面有 1 个表单和 1 个 console error',
      limitations: ['Response body is not available']
    });

    expect(parsed.networkFailures[0]?.method).toBe('GET');
    expect(parsed.limitations?.[0]).toContain('Response body');
  });
});
