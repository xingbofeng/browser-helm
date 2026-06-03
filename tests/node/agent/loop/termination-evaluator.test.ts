import { describe, expect, it } from 'vitest';
import { TerminationEvaluator } from '../../../../src/agent/loop/termination-evaluator';
import type { RuntimeTaskState, RuntimeEvent, RunSnapshot } from '../../../../src/runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';

describe('TerminationEvaluator', () => {
  it('derives unmet success criteria and verifies finish evidence from the trace', () => {
    const trace: RuntimeEvent[] = [{
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.RUN_STARTED,
      payload: {
        successCriteria: ['解释 console error', '给出修复建议']
      }
    }];
    const taskState: RuntimeTaskState = {
      goal: '调试页面',
      completed: ['已经解释 console error'],
      remaining: [],
      filledFieldRefs: [],
      verifiedFieldRefs: [],
      runtimeCompleted: [],
      runtimeFactsOverrideModelNotes: true,
      updatedBy: 'model',
      updatedAt: 1
    };
    const goal = {
      goal: '调试页面',
      successCriteria: ['解释 console error', '给出修复建议'],
      satisfiedCriteria: [],
      unsatisfiedCriteria: ['解释 console error', '给出修复建议']
    } as NonNullable<RunSnapshot['goal']>;

    const result = new TerminationEvaluator().evaluateFinish({
      goal,
      taskState,
      trace,
      finalMessage: 'I do not have enough evidence from the page to explain the fix.'
    });

    expect(result.goal).toMatchObject({
      satisfiedCriteria: ['解释 console error'],
      unsatisfiedCriteria: ['给出修复建议']
    });
    expect(result.unmetCriteria).toEqual(['给出修复建议']);
    expect(result.completionEvidence).toMatchObject({
      ok: true,
      status: 'unknown',
      verifier: 'answer',
      nextAction: 'finish'
    });
  });

  it('returns a continue action when semantic completion evidence is missing', () => {
    const result = new TerminationEvaluator().evaluateFinish({
      goal: undefined,
      taskState: undefined,
      finalMessage: 'The click is complete.',
      trace: [
        {
          runId: 'run_1',
          type: TRACE_EVENT_NAMES.TOOL_RESULT,
          payload: {
            tool: 'bh_action_click',
            ok: true,
            code: 'OK',
            summary: 'Clicked',
            changedPage: true,
            requiresObserve: true
          }
        },
        {
          runId: 'run_1',
          type: TRACE_EVENT_NAMES.TOOL_RESULT,
          payload: {
            tool: 'bh_page_observe',
            ok: true,
            code: 'OK',
            summary: 'Observed'
          }
        }
      ]
    });

    expect(result.completionEvidence).toMatchObject({
      ok: false,
      status: 'unknown',
      nextAction: 'continue',
      verifier: 'click_effect'
    });
  });
});
