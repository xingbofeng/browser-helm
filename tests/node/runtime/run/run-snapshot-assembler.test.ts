import { beforeEach, describe, expect, it } from 'vitest';
import {
  snapshotFromObserveResult,
  extractSnapshotFields,
  fallbackSnapshotFields,
  snapshotToolResult,
  sanitizeToolResultDetail
} from '../../../../src/background/runtime/run/run-snapshot-assembler';
import type { ToolResult } from '../../../../src/shared/schemas/tool-result.schema';
import type { TraceEvent } from '../../../../src/shared/schemas/trace.schema';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { defaultDomainAdapterPreferences } from '../../../../src/adapters/preferences';

let eventSequence = 0;

function traceEvent(type: string, payload: unknown): TraceEvent {
  eventSequence += 1;
  return {
    id: `evt_${eventSequence}`,
    runId: 'agent_1',
    type,
    timestamp: eventSequence,
    schemaVersion: 'test',
    payload
  } as unknown as TraceEvent;
}

function classification(mode: 'ask' | 'debug' | 'form' | 'act', reason: string) {
  return {
    taskType: mode,
    mode,
    reason,
    confidence: 'high' as const,
    matchedSignals: [reason]
  };
}

function finding(title: string) {
  return {
    title,
    explanation: `${title} explanation`,
    evidence: [{ source: 'form' as const, summary: `${title} proof` }],
    confidence: 'high' as const
  };
}

describe('snapshotFromObserveResult', () => {
  beforeEach(() => {
    defaultDomainAdapterPreferences.clear();
  });

  const baseObservation = {
    url: 'https://example.com',
    title: 'Example',
    currentDomain: 'example.com',
    origin: 'https://example.com',
    visibleTextSummary: 'Hello world',
    pageStateSummary: '2 elements',
    refSummary: [
      { refId: 'ref_1', role: 'button', name: 'Submit', tagName: 'button', visible: true }
    ],
    warnings: [],
    interactive: { summary: '', count: 1, elements: [] },
    forms: { summary: '', count: 0 },
    refs: { summary: '', count: 1, items: [] }
  };

  const baseObserveResult: ToolResult = {
    ok: true,
    code: 'OK',
    summary: 'Observed',
    changedPage: false,
    requiresObserve: false,
    data: baseObservation
  };

  it('returns observed status when refs > 0', () => {
    const snapshot = snapshotFromObserveResult('run_1', 'ask', baseObserveResult, []);
    expect(snapshot.status).toBe('observed');
    expect(snapshot.refs).toHaveLength(1);
  });

  it('returns empty status when refs = 0', () => {
    const noRefsResult: ToolResult = {
      ...baseObserveResult,
      data: {
        ...baseObservation,
        refSummary: [],
        interactive: { summary: '', count: 0, elements: [] },
        refs: { summary: '', count: 0, items: [] }
      }
    };
    const snapshot = snapshotFromObserveResult('run_1', 'ask', noRefsResult, []);
    expect(snapshot.status).toBe('empty');
    expect(snapshot.refs).toHaveLength(0);
  });

  it('returns error status on failure', () => {
    const failResult: ToolResult = {
      ok: false,
      code: 'TIMEOUT',
      summary: 'Timed out',
      changedPage: false,
      requiresObserve: false,
      error: { message: 'Connection timed out' }
    };
    const snapshot = snapshotFromObserveResult('run_1', 'ask', failResult, []);
    expect(snapshot.status).toBe('error');
    expect(snapshot.error?.code).toBe('TIMEOUT');
    expect(snapshot.error?.message).toBe('Connection timed out');
  });

  it('preserves structured page data', () => {
    const snapshot = snapshotFromObserveResult('run_1', 'form', baseObserveResult, []);
    expect(snapshot.structuredPageData).toBeDefined();
    expect(snapshot.structuredPageData?.refs.count).toBeTypeOf('number');
  });

  it('includes trace in snapshot', () => {
    const trace = [{ runId: 'run_1', type: 'test_event', timestamp: 1000 }];
    const snapshot = snapshotFromObserveResult('run_1', 'ask', baseObserveResult, trace);
    expect(snapshot.trace).toBe(trace);
  });

  it('includes detected domain adapter status for supported sites', () => {
    const githubResult: ToolResult = {
      ...baseObserveResult,
      data: {
        ...baseObservation,
        url: 'https://github.com/openai/browser-helm/issues',
        currentDomain: 'github.com',
        origin: 'https://github.com'
      }
    };

    const snapshot = snapshotFromObserveResult('run_1', 'ask', githubResult, []);

    expect(snapshot.domainAdapter).toEqual({
      enabled: true,
      id: 'github',
      label: 'GitHub',
      version: '1.0.0',
      workflowCount: 1,
      locatorCount: 1,
      driftStatus: {
        status: 'not_checked',
        genericFallbackReason: 'Use generic browser tools if adapter hints fail drift checks.'
      },
      approvalEnforced: true
    });
  });

  it('marks matched domain adapter disabled when the user disabled it', () => {
    defaultDomainAdapterPreferences.setEnabled('github', false);
    const githubResult: ToolResult = {
      ...baseObserveResult,
      data: {
        ...baseObservation,
        url: 'https://github.com/openai/browser-helm/issues',
        currentDomain: 'github.com',
        origin: 'https://github.com'
      }
    };

    const snapshot = snapshotFromObserveResult('run_1', 'ask', githubResult, []);

    expect(snapshot.domainAdapter).toEqual({
      enabled: false,
      fallback: 'generic_browser_tools',
      reason: 'GitHub adapter disabled by user',
      disabledAdapter: {
        id: 'github',
        label: 'GitHub'
      }
    });
  });
});

describe('snapshotToolResult', () => {
  it('creates snapshot tool result from ToolResult', () => {
    const result: ToolResult = {
      ok: true,
      code: 'OK',
      summary: 'Done',
      changedPage: true,
      requiresObserve: false,
      data: { some: 'data' }
    };
    const snap = snapshotToolResult('bh_test', result);
    expect(snap.tool).toBe('bh_test');
    expect(snap.ok).toBe(true);
    expect(snap.code).toBe('OK');
    expect(snap.summary).toBe('Done');
    expect(snap.changedPage).toBe(true);
    expect(snap.requiresObserve).toBe(false);
  });

  it('sanitizes detail to remove sensitive data', () => {
    const result: ToolResult = {
      ok: true,
      code: 'OK',
      summary: 'Done',
      changedPage: false,
      requiresObserve: false,
      data: { apiKey: 'sk-secret12345678', name: 'visible' }
    };
    const snap = snapshotToolResult('bh_test', result);
    const detail = snap.detail as Record<string, unknown>;
    const data = detail.data as Record<string, unknown>;
    expect(data.name).toBe('visible');
    // apiKey should be sanitized (empty string since it matches sensitive pattern)
    expect(data.apiKey).not.toBe('sk-secret12345678');
  });
});

describe('sanitizeToolResultDetail', () => {
  it('returns sanitized copy of data/error/approval', () => {
    const result: ToolResult = {
      ok: true,
      code: 'OK',
      summary: 'Done',
      changedPage: false,
      requiresObserve: false,
      data: { password: 'secret123', user: 'alice' }
    };
    const sanitized = sanitizeToolResultDetail(result);
    const record = sanitized as Record<string, unknown>;
    const data = record.data as Record<string, unknown>;
    expect(data.user).toBe('alice');
    expect(data.password).not.toBe('secret123');
  });
});

describe('extractSnapshotFields', () => {
  it('extracts classification from trace', () => {
    const nextClassification = classification('form', 'form keywords');
    const trace: TraceEvent[] = [
      traceEvent(TRACE_EVENT_NAMES.TASK_CLASSIFIED, { classification: nextClassification })
    ];
    const fields = extractSnapshotFields(trace);
    expect(fields.classification).toEqual(nextClassification);
    expect(fields.modeReason).toBe('form keywords');
  });

  it('extracts capabilities from trace', () => {
    const capabilities = {
      hasActiveTab: true,
      hasDebuggerPermission: false,
      hasClipboardPermission: false,
      hasDownloadsPermission: false,
      hostPermissions: [],
      shallowDebugAvailable: true,
      cdp: 'unavailable' as const
    };
    const trace: TraceEvent[] = [
      traceEvent(TRACE_EVENT_NAMES.CAPABILITIES_RESOLVED, {
        capabilities,
        limitations: ['no deep debug']
      })
    ];
    const fields = extractSnapshotFields(trace);
    expect(fields.capabilities).toEqual(capabilities);
    expect(fields.capabilityLimitations).toEqual(['no deep debug']);
  });

  it('extracts plan and goal from trace', () => {
    const goal = {
      goal: 'test',
      successCriteria: ['done'],
      satisfiedCriteria: [],
      unsatisfiedCriteria: ['done']
    };
    const plan = {
      id: 'plan_1',
      mode: 'form' as const,
      steps: [{ id: 'step_1', title: 'Observe', status: 'pending' as const }],
      updatedAt: 1000
    };
    const trace: TraceEvent[] = [
      traceEvent(TRACE_EVENT_NAMES.PLAN_UPDATED, { plan, goal })
    ];
    const fields = extractSnapshotFields(trace);
    expect(fields.plan).toBe(plan);
    expect(fields.goal).toBe(goal);
  });

  it('extracts recovery from trace', () => {
    const recovery = {
      action: { type: 're_observe' as const, reason: 'retry' },
      attempts: 1,
      budgetRemaining: 2
    };
    const trace: TraceEvent[] = [
      traceEvent(TRACE_EVENT_NAMES.RECOVERY_ACTION, { recovery })
    ];
    const fields = extractSnapshotFields(trace);
    expect(fields.recovery).toBe(recovery);
  });

  it('extracts findings from trace', () => {
    const findings = [finding('Issue 1')];
    const trace: TraceEvent[] = [
      traceEvent(TRACE_EVENT_NAMES.FINDINGS_REPORTED, { findings })
    ];
    const fields = extractSnapshotFields(trace);
    expect(fields.findings).toBe(findings);
  });

  it('extracts debugReport from trace', () => {
    const report = { title: 'Report', findings: [], recommendations: [] };
    const trace: TraceEvent[] = [
      traceEvent(TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED, { report })
    ];
    const fields = extractSnapshotFields(trace);
    expect(fields.debugReport).toBe(report);
  });

  it('returns empty fields for empty trace', () => {
    const fields = extractSnapshotFields([]);
    expect(fields.classification).toBeUndefined();
    expect(fields.capabilities).toBeUndefined();
    expect(fields.plan).toBeUndefined();
    expect(fields.goal).toBeUndefined();
    expect(fields.recovery).toBeUndefined();
    expect(fields.findings).toBeUndefined();
    expect(fields.debugReport).toBeUndefined();
  });

  it('uses last event when multiple events of same type exist', () => {
    const trace: TraceEvent[] = [
      traceEvent(TRACE_EVENT_NAMES.TASK_CLASSIFIED, {
        classification: classification('ask', 'first')
      }),
      traceEvent(TRACE_EVENT_NAMES.TASK_CLASSIFIED, {
        classification: classification('form', 'second')
      })
    ];
    const fields = extractSnapshotFields(trace);
    expect(fields.classification?.mode).toBe('form');
    expect(fields.modeReason).toBe('second');
  });
});

describe('fallbackSnapshotFields', () => {
  it('generates fallback form diagnostic fields', () => {
    const observeResult: ToolResult = {
      ok: true,
      code: 'OK',
      summary: 'Observed',
      changedPage: false,
      requiresObserve: false,
      data: {
        url: 'https://example.com',
        title: 'Form Page',
        currentDomain: 'example.com',
        origin: 'https://example.com',
        visibleTextSummary: 'Name Email',
        pageStateSummary: '3 elements',
        refSummary: [],
        warnings: [],
        formFields: {
          fields: [],
          submit: { available: false },
          warnings: []
        }
      }
    };
    const fields = fallbackSnapshotFields('form', observeResult, 'zh');
    expect(fields.classification).toBeDefined();
    expect(fields.capabilities).toBeDefined();
    expect(fields.goal).toBeDefined();
    expect(fields.plan).toBeDefined();
    expect(fields.debugReport?.title).toContain('Form Doctor');
  });

  it('generates fallback debug diagnostic fields', () => {
    const observeResult: ToolResult = {
      ok: true,
      code: 'OK',
      summary: 'Observed',
      changedPage: false,
      requiresObserve: false,
      data: {
        url: 'https://example.com',
        title: 'Test',
        currentDomain: 'example.com',
        origin: 'https://example.com',
        visibleTextSummary: '',
        pageStateSummary: '',
        refSummary: [],
        warnings: [],
        pageHealth: {
          consoleErrors: [],
          networkFailures: [],
          hasForm: false,
          pageStateSummary: '页面无明显运行时错误',
          limitations: ['no deep debug']
        }
      }
    };
    const fields = fallbackSnapshotFields('debug', observeResult, 'zh');
    expect(fields.debugReport?.title).toContain('Page Inspector');
  });

  it('generates fields even when observe failed', () => {
    const observeResult: ToolResult = {
      ok: false,
      code: 'TIMEOUT',
      summary: 'Timed out',
      changedPage: false,
      requiresObserve: false
    };
    const fields = fallbackSnapshotFields('debug', observeResult, 'zh');
    expect(fields.classification).toBeDefined();
    expect(fields.goal).toBeDefined();
  });
});
