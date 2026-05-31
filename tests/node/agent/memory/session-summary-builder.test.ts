import { describe, expect, it } from 'vitest';

import { buildRunSummary } from '../../../../src/agent/memory/run-summary-builder';
import { buildSessionSummary } from '../../../../src/agent/memory/session-summary-builder';
import { buildStepSummaries } from '../../../../src/agent/memory/step-summary-builder';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RunSnapshot, RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('session summary builders', () => {
  it('builds StepSummary and RunSummary from tool trace events', () => {
    const trace = toolTrace('run_1');

    expect(buildStepSummaries(trace)).toMatchObject([{
      tool: TOOL_NAMES.PAGE_OBSERVE,
      outcome: 'success',
      summary: 'Observed dashboard'
    }]);

    const runSummary = buildRunSummary({
      runId: 'run_1',
      task: 'Inspect dashboard',
      trace,
      snapshot: snapshot('run_1')
    });
    expect(runSummary.outcome).toBe('success');
    expect(runSummary.completionCriteria).toEqual(['Dashboard observed']);
    expect(runSummary.completionEvidence).toContain('Observed dashboard');
  });

  it('builds SessionSummary with page state and reusable locators', () => {
    const summary = buildSessionSummary({
      sessionId: 'run_1',
      taskGoal: 'Inspect dashboard',
      trace: toolTrace('run_1'),
      snapshot: snapshot('run_1')
    });

    expect(summary).toMatchObject({
      sessionId: 'run_1',
      domain: 'app.example.com',
      taskGoal: 'Inspect dashboard'
    });
    expect(summary.importantPageState).toContain('Dashboard');
    expect(summary.confirmedActions[0]).toContain(TOOL_NAMES.PAGE_OBSERVE);
    expect(summary.reusableLocators[0]).toContain('ref_submit');
  });
});

function toolTrace(runId: string): RuntimeEvent[] {
  return [
    {
      runId,
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        args: {}
      }
    },
    {
      runId,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        ok: true,
        code: 'OK',
        summary: 'Observed dashboard',
        changedPage: false,
        requiresObserve: false
      }
    }
  ];
}

function snapshot(runId: string): RunSnapshot {
  return {
    runId,
    mode: 'ask',
    status: 'finished',
    observation: {
      url: 'https://app.example.com/dashboard',
      title: 'Dashboard',
      currentDomain: 'app.example.com',
      origin: 'https://app.example.com',
      visibleTextSummary: 'Billing dashboard visible',
      pageStateSummary: 'Ready',
      interactiveCount: 1,
      warnings: []
    },
    refs: [{
      refId: 'ref_submit',
      role: 'button',
      name: 'Submit',
      tagName: 'button',
      visible: true
    }],
    goal: {
      goal: 'Inspect dashboard',
      successCriteria: ['Dashboard observed'],
      satisfiedCriteria: ['Observed dashboard'],
      unsatisfiedCriteria: []
    },
    trace: []
  };
}
