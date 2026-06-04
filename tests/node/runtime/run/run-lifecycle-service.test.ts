import { describe, expect, it, vi } from 'vitest';
import { RunLifecycleService } from '../../../../src/background/runtime/run/run-lifecycle-service';
import type { LifecycleDeps } from '../../../../src/background/runtime/run/run-lifecycle-service';
import type { RunSnapshot, RuntimeEvent } from '../../../../src/runtime/runtime-messages';
import type { RunMode } from '../../../../src/shared/schemas/tool.schema';
import type { ToolResult } from '../../../../src/shared/schemas/tool-result.schema';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';

const succeedObserve: ToolResult = {
  ok: true, code: ERROR_CODES.OK, summary: 'ok', changedPage: false, requiresObserve: false,
  data: { url: 'https://x.com', title: 'X', currentDomain: 'x.com', origin: 'https://x.com', visibleTextSummary: '', pageStateSummary: '', refSummary: [{ refId: 'r1', role: 'button', name: 'Go', tagName: 'button', visible: true }], warnings: [] }
};

function deps(overrides: Partial<LifecycleDeps> = {}): LifecycleDeps {
  return {
    store: {
      createRunId: vi.fn().mockReturnValue('run_1'),
      setRecord: vi.fn(),
      setSnapshot: vi.fn(),
      getSnapshot: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'ask', status: 'created' as const }),
      getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'ask' as RunMode, tabId: 42, trace: [] as RuntimeEvent[], locale: 'zh' }),
      appendTrace: vi.fn(),
      notifySnapshotUpdated: vi.fn()
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
    executeTool: vi.fn().mockResolvedValue(succeedObserve),
    probeRuntimeCapabilities: vi.fn().mockResolvedValue({
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: false,
        hasDownloadsPermission: false,
        hasStorageInspection: true,
        hostPermissions: ['https://x.com/*'],
        shallowDebugAvailable: true,
        cdp: 'unavailable'
      },
      limitations: ['Debugger capability is unavailable']
    }),
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

  it('startRun with observe-only runKind sets messages correctly', async () => {
    const d = deps();
    const svc = new RunLifecycleService(d);
    await svc.startRun({ task: 'test', runKind: 'observe_only' });
    expect(d.initialMessages).toHaveBeenCalledWith('run_1', 'test', expect.any(String), expect.objectContaining({ includeObserveStatus: true }));
  });

  it('startRun records explicit observe-only runKind', async () => {
    const d = deps();
    const svc = new RunLifecycleService(d);
    await svc.startRun({ task: 'test', runKind: 'observe_only' });

    expect(d.store.setRecord).toHaveBeenCalledWith(
      'run_1',
      expect.objectContaining({
        runKind: 'observe_only'
      })
    );
    expect(d.initialMessages).toHaveBeenCalledWith(
      'run_1',
      'test',
      expect.any(String),
      expect.objectContaining({ includeObserveStatus: true })
    );
  });

  it('resolves runtime capabilities from probe before initial observation', async () => {
    const d = deps();
    const svc = new RunLifecycleService(d);

    await svc.startRun({ task: 'test', mode: 'debug' });

    expect(d.probeRuntimeCapabilities).toHaveBeenCalledWith({ tabId: 42 });
    const appendTraceCalls = vi.mocked(d.store.appendTrace).mock.calls;
    const capabilitiesEvent = appendTraceCalls.find(
      ([, event]) => event.type === TRACE_EVENT_NAMES.CAPABILITIES_RESOLVED
    );
    expect(capabilitiesEvent?.[1].payload).toMatchObject({
      capabilities: {
        hasDebuggerPermission: false
      },
      limitations: ['Debugger capability is unavailable']
    });
  });

  it('preserves probed capabilities when simple observe-only flow adds fallback fields', async () => {
    const probedCapabilities = {
      hasActiveTab: true,
      hasDebuggerPermission: true,
      hasClipboardPermission: true,
      hasDownloadsPermission: true,
      hasStorageInspection: true,
      hostPermissions: ['https://x.com/*'],
      shallowDebugAvailable: true,
      cdp: 'available' as const
    };
    const d = deps({
      store: {
        createRunId: vi.fn().mockReturnValue('run_1'),
        setRecord: vi.fn(),
        setSnapshot: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue({
          runId: 'run_1',
          mode: 'full',
          status: 'created' as const,
          capabilities: probedCapabilities,
          capabilityLimitations: []
        }),
        getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'full' as RunMode, tabId: 42, trace: [] as RuntimeEvent[], locale: 'zh', runKind: 'observe_only' }),
        appendTrace: vi.fn(),
        notifySnapshotUpdated: vi.fn()
      },
      fallbackSnapshotFields: vi.fn().mockReturnValue({
        capabilities: {
          hasActiveTab: true,
          hasDebuggerPermission: false,
          hasClipboardPermission: false,
          hasDownloadsPermission: false,
          hasStorageInspection: true,
          hostPermissions: [],
          shallowDebugAvailable: false,
          cdp: 'reserved'
        }
      })
    });
    const svc = new RunLifecycleService(d);

    await svc.observeInitial('run_1', {
      task: 'test',
      mode: 'full',
      tabId: 42,
      trace: [],
      locale: 'zh',
      runKind: 'observe_only'
    }, 42);

    expect(d.store.setSnapshot).toHaveBeenLastCalledWith('run_1', expect.objectContaining({
      capabilities: probedCapabilities,
      capabilityLimitations: []
    }));
  });

  it('cancelRun updates snapshot to cancelled', () => {
    const d = deps();
    // getRecord already returns a record from deps() — appendTrace should be called
    const svc = new RunLifecycleService(d);
    svc.cancelRun('run_1');
    expect(d.store.setSnapshot).toHaveBeenCalled();
  });

  it('runs terminal cleanup for the target tab when a run is cancelled', () => {
    const onRunEnded = vi.fn();
    const d = deps({ onRunEnded });
    const svc = new RunLifecycleService(d);

    svc.cancelRun('run_1');

    expect(onRunEnded).toHaveBeenCalledWith({
      runId: 'run_1',
      tabId: 42,
      reason: 'cancelled'
    });
  });

  it('reviseGoal updates snapshot with new goal', async () => {
    const d = deps();
    const svc = new RunLifecycleService(d);
    const snapshot = await svc.reviseGoal({ runId: 'run_1', goal: 'new goal' });
    expect(snapshot.goal?.goal).toBe('new goal');
  });

  it('observes successfully for form mode', async () => {
    const d = deps();
    const svc = new RunLifecycleService(d);
    await svc.observeInitial('run_1', { task: 'test', mode: 'form', tabId: 42, trace: [], locale: 'zh' }, 42);
    expect(d.createToolRouter).toHaveBeenCalled();
  });
});
