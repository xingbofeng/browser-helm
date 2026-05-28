import { describe, expect, it } from 'vitest';

import { runtimeEventSchema, startRunInputSchema } from '../../../src/runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../../src/shared/constants/event-names';

describe('runtimeEventSchema', () => {
  it('accepts known runtime and trace event types', () => {
    expect(runtimeEventSchema.parse({
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      timestamp: 1,
      payload: { tool: 'bh_page_observe' }
    })).toMatchObject({
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.TOOL_STARTED
    });
    expect(runtimeEventSchema.parse({
      runId: 'run_1',
      type: 'snapshot_updated'
    })).toMatchObject({
      type: 'snapshot_updated'
    });
  });

  it('rejects unknown event types', () => {
    expect(runtimeEventSchema.safeParse({
      runId: 'run_1',
      type: 'made_up_event'
    }).success).toBe(false);
  });

  it('rejects non-object payloads for typed runtime events', () => {
    expect(runtimeEventSchema.safeParse({
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: 'raw text payload'
    }).success).toBe(false);
  });
});

describe('startRunInputSchema', () => {
  it('uses explicit runKind instead of a provider-skip boolean for observe-only runs', () => {
    expect(startRunInputSchema.parse({
      task: '观察当前页面',
      runKind: 'observe_only'
    })).toMatchObject({
      runKind: 'observe_only'
    });
  });

  it('accepts goal and success criteria on initial start input', () => {
    expect(startRunInputSchema.parse({
      task: '检查这个表单',
      goal: '解释提交按钮为什么不可用',
      successCriteria: ['列出阻塞字段', '给出修复建议']
    })).toMatchObject({
      goal: '解释提交按钮为什么不可用',
      successCriteria: ['列出阻塞字段', '给出修复建议']
    });
  });
});
