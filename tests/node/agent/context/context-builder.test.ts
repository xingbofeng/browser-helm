import { describe, expect, it } from 'vitest';

import { ContextBuilder } from '../../../../src/agent/context/context-builder';
import type { LoopTurn } from '../../../../src/agent/kernel/agent-step';

describe('context-builder', () => {
  it('builds model messages with task, goal and compact context', () => {
    const turns: LoopTurn[] = [
      {
        id: 't1',
        runId: 'run_1',
        stepIndex: 0,
        decision: {
          type: 'tool_call',
          tool: 'bh_mock_page_observe',
          args: {}
        },
        toolResult: {
          ok: true,
          code: 'OK',
          summary: 'Captured page summary'
        }
      }
    ];

    const builder = new ContextBuilder();
    const built = builder.build({
      task: 'Diagnose form issue',
      goal: 'Find root cause',
      successCriteria: ['Explain why submit is disabled'],
      turns,
      toolNames: ['bh_mock_page_observe']
    });

    expect(built.messages).toHaveLength(2);
    expect(built.messages[0]?.role).toBe('system');
    expect(built.messages[0]?.content).toContain('tool_call shape');
    expect(built.messages[0]?.content).toContain('Available tools:');
    expect(built.messages[0]?.content).toContain('bh_mock_page_observe');
    expect(built.messages[1]?.content).toContain('Diagnose form issue');
    expect(built.messages[1]?.content).toContain('Captured page summary');
    expect(built.compacted.steps).toHaveLength(1);
  });

  it('includes mode reason and classification summary without changing tools', () => {
    const builder = new ContextBuilder();
    const built = builder.build({
      task: '检查 console 错误',
      turns: [],
      toolNames: ['bh_page_observe'],
      runMode: 'debug',
      modeReason: '任务关注页面错误，适合调试 / Debug 诊断。',
      classification: {
        mode: 'debug',
        taskType: 'debug',
        reason: '任务关注页面错误',
        confidence: 'high',
        matchedSignals: ['console']
      }
    });

    expect(built.messages[1]?.content).toContain('ModeReason:');
    expect(built.messages[1]?.content).toContain('Classification: debug');
    expect(built.messages[0]?.content).toContain('bh_page_observe');
  });

  it('includes plan progress and report summary without exposing full report data', () => {
    const builder = new ContextBuilder();
    const built = builder.build({
      task: '诊断表单',
      turns: [],
      toolNames: ['bh_form_read_fields'],
      runMode: 'form',
      planProgress: {
        done: ['观察页面'],
        current: '读取表单字段',
        pending: ['输出表单诊断报告']
      },
      reportSummary: '发现 1 个高置信度 finding；限制：只读诊断'
    });

    expect(built.messages[1]?.content).toContain('PlanProgress:');
    expect(built.messages[1]?.content).toContain('done=观察页面');
    expect(built.messages[1]?.content).toContain('current=读取表单字段');
    expect(built.messages[1]?.content).toContain('ReportSummary: 发现 1 个高置信度 finding');
  });
});
