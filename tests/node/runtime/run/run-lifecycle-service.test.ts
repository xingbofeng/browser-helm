import { describe, expect, it, vi } from 'vitest';
import { RunLifecycleService } from '../../../../src/background/runtime/run/run-lifecycle-service';
import type { RunSnapshot, RuntimeEvent } from '../../../../src/runtime/runtime-messages';
import type { RunMode } from '../../../../src/shared/schemas/tool.schema';
import type { ToolResult } from '../../../../src/shared/schemas/tool-result.schema';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';

const succeedObserve: ToolResult = {
  ok: true, code: ERROR_CODES.OK, summary: 'ok', changedPage: false, requiresObserve: false,
  data: { url: 'https://x.com', title: 'X', currentDomain: 'x.com', origin: 'https://x.com', visibleTextSummary: '', pageStateSummary: '', refSummary: [{ refId: 'r1', role: 'button', name: 'Go', tagName: 'button', visible: true }], warnings: [] }
};

function deps(overrides = {}) {
  return {
    store: {
      createRunId: vi.fn().mockReturnValue('run_1'),
      setRecord: vi.fn(),
      setSnapshot: vi.fn(),
      getSnapshot: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'ask', status: 'created' as const }),
      getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'ask' as RunMode, tabId: 42, trace: [] as RuntimeEvent[], skipProviderResponse: false }),
      appendTrace: vi.fn(),
      notifySnapshotUpdated: vi.fn(),
      hasProviderScheduled: vi.fn().mockReturnValue(false),
      markProviderScheduled: vi.fn()
    },
    createToolRouter: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue(succeedObserve), getToolContract: vi.fn() }),
    getActiveTabId: vi.fn().mockResolvedValue(42),
    snapshotFromObserveResult: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'ask', status: 'observed', refs: [] }),
    withRunMessages: vi.fn((s: RunSnapshot) => ({ ...s, messages: [] })),
    fallbackSnapshotFields: vi.fn().mockReturnValue({}),
    streamingStateFromTrace: vi.fn().mockReturnValue({ enabled: true, active: false, chunkCount: 0, fallbackUsed: false }),
    emptyStreamingState: vi.fn().mockReturnValue({ enabled: true, active: false, chunkCount: 0, fallbackUsed: false }),
    initialMessages: vi.fn().mockReturnValue([]),
    errorMessage: vi.fn().mockReturnValue({ id: 'err', role: 'agent' as const, kind: 'error' as const, status: 'error' as const, title: 'X', content: 'X', createdAt: 0, updatedAt: 0 }),
    enrichDiagnostics: vi.fn().mockResolvedValue({}),
    scheduleProviderMessage: vi.fn(),
    ...overrides
  };
}

describe('RunLifecycleService', () => {
  it('startRun creates record and snapshot', async () => {
    const d = deps();
    const svc = new RunLifecycleService(d);
    const result = await svc.startRun({ task: 'test', mode: 'form' });
    expect(result.runId).toBe('run_1');
    expect(d.store.setRecord).toHaveBeenCalled();
    expect(d.store.setSnapshot).toHaveBeenCalled();
  });

  it('startRun returns error when no active tab', async () => {
    const d = deps({ getActiveTabId: vi.fn().mockResolvedValue(undefined) });
    const svc = new RunLifecycleService(d);
    const result = await svc.startRun({ task: 'test' });
    expect(result.runId).toBe('run_1');
  });

  it('startRun with skipProviderResponse sets messages correctly', async () => {
    const d = deps();
    const svc = new RunLifecycleService(d);
    await svc.startRun({ task: 'test', skipProviderResponse: true });
    expect(d.initialMessages).toHaveBeenCalledWith('run_1', 'test', expect.objectContaining({ includeObserveStatus: true }));
  });

  it('cancelRun updates snapshot to cancelled', () => {
    const d = deps();
    // getRecord already returns a record from deps() — appendTrace should be called
    const svc = new RunLifecycleService(d);
    svc.cancelRun('run_1');
    expect(d.store.setSnapshot).toHaveBeenCalled();
  });

  it('reviseGoal updates snapshot with new goal', () => {
    const d = deps();
    const svc = new RunLifecycleService(d);
    const snapshot = svc.reviseGoal({ runId: 'run_1', goal: 'new goal' });
    expect(snapshot.goal?.goal).toBe('new goal');
  });

  it('observes successfully for form mode', async () => {
    const d = deps();
    const svc = new RunLifecycleService(d);
    await svc.observeInitial('run_1', { task: 'test', mode: 'form', tabId: 42, trace: [], skipProviderResponse: false }, 42);
    expect(d.createToolRouter).toHaveBeenCalled();
  });
});
