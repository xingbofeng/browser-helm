import { describe, expect, it } from 'vitest';

import { verifyTaskCompletionBeforeFinish } from '../../../../src/agent/verification/task-verifier';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('task verifier', () => {
  it('blocks finish when a mutating tool reports success without page change evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_MANY,
          ok: true,
          code: 'OK',
          summary: 'ok',
          changedPage: false
        }
      }
    ])).toMatchObject({
      ok: false,
      tool: TOOL_NAMES.FORM_FILL_MANY
    });
  });

  it('allows finish when mutating success includes page change evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_MANY,
          ok: true,
          code: 'OK',
          summary: 'ok',
          changedPage: true
        }
      }
    ])).toEqual({ ok: true });
  });

  it('blocks finish when a navigation-like action still requires observation evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.ACTION_CLICK,
          ok: true,
          code: 'OK',
          summary: 'clicked',
          changedPage: true,
          requiresObserve: true
        }
      }
    ])).toMatchObject({
      ok: false,
      tool: TOOL_NAMES.ACTION_CLICK
    });
  });

  it('allows finish after a navigation-like action is followed by observation', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.ACTION_CLICK,
          ok: true,
          code: 'OK',
          summary: 'clicked',
          changedPage: true,
          requiresObserve: true
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'observed',
          changedPage: false,
          requiresObserve: false
        }
      }
    ])).toEqual({ ok: true });
  });

  it('blocks finish after submit result when no post-submit observation exists', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'unknown',
          summary: 'submitted'
        }
      }
    ])).toMatchObject({
      ok: false,
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL
    });
  });

  it('allows finish after submit result is followed by observation', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'unknown',
          summary: 'submitted'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'observed',
          changedPage: false,
          requiresObserve: false
        }
      }
    ])).toEqual({ ok: true });
  });

  it('blocks finish after workflow replay without postcondition score evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
          ok: true,
          code: 'OK',
          summary: 'Workflow replay completed',
          changedPage: false,
          requiresObserve: false
        }
      }
    ])).toMatchObject({
      ok: false,
      tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL
    });
  });

  it('allows finish after workflow replay has score evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
          ok: true,
          code: 'OK',
          summary: 'Workflow replay completed',
          changedPage: false,
          requiresObserve: false
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_SCORE,
          ok: true,
          code: 'OK',
          summary: 'Scored workflow',
          changedPage: false,
          requiresObserve: false
        }
      }
    ])).toEqual({ ok: true });
  });
});
