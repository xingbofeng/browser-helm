import { describe, expect, it, vi } from 'vitest';
import { ToolExecutionService } from '../../../../../src/background/runtime/run/tools/tool-execution-service';
import type { ToolExecutionDeps } from '../../../../../src/background/runtime/run/tools/tool-execution-service';
import type { ToolRuntimeAdapter } from '../../../../../src/background/runtime/run/tools/adapters/tool-runtime-adapter';
import { ERROR_CODES } from '../../../../../src/shared/constants/error-codes';
import type { RunMode } from '../../../../../src/shared/schemas/tool.schema';
import type { ToolResult } from '../../../../../src/shared/schemas/tool-result.schema';

const noopAdapter: ToolRuntimeAdapter = {
  beforeExecution: () => [],
  afterExecution: () => [],
  afterApprovalRequested: () => []
};

const baseInput = { runId: 'run_1', tool: 'bh_test', args: {} };

function snapshotFromResult(tool: string, result: ToolResult) {
  return {
    tool,
    ok: result.ok,
    code: result.code,
    summary: result.summary
  };
}

function deps(overrides = {}) {
  return {
    getSnapshot: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'ask', status: 'observed' as const }),
    getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'ask' as RunMode, tabId: 42, trace: [] }),
    createToolRouter: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue({ ok: true, code: ERROR_CODES.OK, summary: 'ok', changedPage: false, requiresObserve: false }), getToolContract: vi.fn().mockReturnValue(null) }),
    createContentRpcClient: vi.fn(),
    appendTrace: vi.fn(),
    setSnapshot: vi.fn(),
    setPendingAction: vi.fn(),
    snapshotToolResult: vi.fn().mockReturnValue({ tool: 'bh_test', ok: true, code: ERROR_CODES.OK, summary: 'ok' }),
    adapter: noopAdapter,
    toolPolicy: { evaluate: vi.fn().mockReturnValue({ allow: true, requiresApproval: false, reason: '', risk: 'low' }) },
    approvalManager: { create: vi.fn().mockReturnValue({ id: 'req_1' }) },
    approvalRequestForTrace: vi.fn().mockImplementation((r: unknown) => r),
    approvalRequiredResultFn: vi.fn().mockReturnValue({ ok: false, code: ERROR_CODES.APPROVAL_REQUIRED, summary: 'approval needed', changedPage: false, requiresObserve: false }),
    ...overrides
  };
}

describe('ToolExecutionService', () => {
  it('returns RUN_CANCELLED for cancelled run', async () => {
    const d = deps({ getSnapshot: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'ask', status: 'cancelled' as const }) });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(ERROR_CODES.RUN_CANCELLED);
  });
  it('returns error for missing tab', async () => {
    const d = deps({ getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'ask', trace: [] }) });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.ok).toBe(false);
  });
  it('returns waiting_for_approval when policy blocks', async () => {
    const d = deps({
      toolPolicy: { evaluate: vi.fn().mockReturnValue({ allow: false, requiresApproval: true, reason: 'high risk', risk: 'high' }) },
      createToolRouter: vi.fn().mockReturnValue({ execute: vi.fn(), getToolContract: vi.fn().mockReturnValue({ risk: 'high', title: 'Test Tool' }) })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
  });
  it('passes full mode into policy so high-risk tools can run without approval interception', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, code: ERROR_CODES.OK, summary: 'ok', changedPage: false, requiresObserve: false });
    const evaluate = vi.fn().mockReturnValue({ allow: true, requiresApproval: false, reason: '', risk: 'high' });
    const d = deps({
      getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'full' as RunMode, tabId: 42, trace: [] }),
      toolPolicy: { evaluate },
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({ risk: 'high', title: 'Test Tool' })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(evaluate).toHaveBeenCalledWith('high', 'full');
    expect(execute).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
  it('returns waiting_for_approval when result.requiresApproval', async () => {
    const d = deps();
    d.createToolRouter = vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue({ ok: true, code: ERROR_CODES.OK, summary: 'ok', changedPage: false, requiresObserve: false, requiresApproval: true, approval: { risk: 'high', reason: 'needs approval' } }),
      getToolContract: vi.fn().mockReturnValue(null)
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.requiresApproval).toBe(true);
  });
  it('returns success', async () => {
    const d = deps();
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.ok).toBe(true);
  });
  it('returns error on failure', async () => {
    const d = deps();
    d.createToolRouter = vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue({ ok: false, code: 'ERR', summary: 'fail', changedPage: false, requiresObserve: false }),
      getToolContract: vi.fn().mockReturnValue(null)
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.ok).toBe(false);
  });
  it('runs recovery re-observe for stale ref failures', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        code: 'REF_STALE',
        summary: 'ref is stale',
        changedPage: false,
        requiresObserve: true
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'observed again',
        changedPage: false,
        requiresObserve: false,
        data: {
          url: 'https://example.com',
          title: 'Example',
          currentDomain: 'example.com',
          origin: 'https://example.com',
          visibleTextSummary: '',
          pageStateSummary: '',
          refSummary: [],
          warnings: []
        }
      });
    const d = deps({
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue(null)
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    const result = await svc.execute(baseInput);

    expect(result.ok).toBe(false);
    expect(execute).toHaveBeenLastCalledWith(
      { tool: 'bh_page_observe', args: {} },
      expect.objectContaining({ stepId: 'run_1:recovery_observe' })
    );
    const lastSetSnapshotCall = vi.mocked(d.setSnapshot).mock.calls.at(-1) as unknown as [
      string,
      { status?: string; recovery?: { action?: { type?: string } } }
    ] | undefined;
    expect(lastSetSnapshotCall?.[0]).toBe('run_1');
    expect(lastSetSnapshotCall?.[1]).toMatchObject({
      status: 'observed',
      recovery: {
        action: { type: 're_observe' }
      }
    });
  });
  it('records recovery and retries once with deterministically repaired tool args', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        summary: 'invalid args',
        changedPage: false,
        requiresObserve: false
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'retried with repaired args',
        changedPage: false,
        requiresObserve: false
      });
    const d = deps({
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          risk: 'safe',
          title: 'Test Tool',
          argsSchema: {
            type: 'object',
            properties: {
              count: { type: 'integer' },
              enabled: { type: 'boolean' }
            }
          }
        })
      }),
      snapshotToolResult: vi.fn().mockImplementation(snapshotFromResult)
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    const result = await svc.execute({
      ...baseInput,
      args: { count: '3', enabled: 'true' }
    });

    expect(result.ok).toBe(false);
    expect(execute).toHaveBeenNthCalledWith(
      2,
      { tool: 'bh_test', args: { count: 3, enabled: true } },
      expect.objectContaining({ stepId: 'run_1:bh_test:recovery_retry' })
    );
    const recoveryEvent = vi.mocked(d.appendTrace).mock.calls
      .map((call) => call[1] as { type?: string; payload?: unknown })
      .find((event) => event.type === 'recovery_action');
    expect(recoveryEvent).toMatchObject({
      type: 'recovery_action',
      payload: {
        recovery: {
          action: { type: 'repair_tool_args', reason: ERROR_CODES.TOOL_ARGS_INVALID }
        }
      }
    });
    const lastSetSnapshotCall = vi.mocked(d.setSnapshot).mock.calls.at(-1) as unknown as [
      string,
      { status?: string; recovery?: { action?: { type?: string } }; toolResult?: { ok?: boolean } }
    ] | undefined;
    expect(lastSetSnapshotCall?.[1]).toMatchObject({
      status: 'observed',
      recovery: { action: { type: 'repair_tool_args' } },
      toolResult: { ok: true }
    });
  });
  it('waits for user input when invalid tool args cannot be repaired deterministically', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: false,
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      summary: 'missing required args',
      changedPage: false,
      requiresObserve: false
    });
    const d = deps({
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          risk: 'safe',
          title: 'Test Tool',
          argsSchema: {
            type: 'object',
            properties: {
              count: { type: 'integer' }
            }
          }
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    await svc.execute({
      ...baseInput,
      args: {}
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const lastSetSnapshotCall = vi.mocked(d.setSnapshot).mock.calls.at(-1) as unknown as [
      string,
      { status?: string; canReviseGoal?: boolean; recovery?: { limitation?: string } }
    ] | undefined;
    expect(lastSetSnapshotCall?.[1]).toMatchObject({
      status: 'waiting_for_user',
      canReviseGoal: true,
      recovery: {
        limitation: 'Tool arguments could not be repaired deterministically'
      }
    });
  });
  it('re-observes and retries with a deterministic alternative ref candidate', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        code: ERROR_CODES.ELEMENT_NOT_FOUND,
        summary: 'old ref missing',
        changedPage: false,
        requiresObserve: true
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'observed again',
        changedPage: false,
        requiresObserve: false,
        data: {
          url: 'https://example.com',
          title: 'Example',
          currentDomain: 'example.com',
          origin: 'https://example.com',
          visibleTextSummary: '',
          pageStateSummary: '',
          refSummary: [
            { refId: 'old', role: 'button', name: 'Submit', tagName: 'button', visible: false },
            { refId: 'new', role: 'button', name: 'Submit', tagName: 'button', visible: true }
          ],
          warnings: []
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'retried with new ref',
        changedPage: false,
        requiresObserve: false
      });
    const d = deps({
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue(null)
      }),
      snapshotToolResult: vi.fn().mockImplementation(snapshotFromResult)
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    await svc.execute({
      ...baseInput,
      args: { refId: 'old', role: 'button', name: 'Submit' }
    });

    expect(execute).toHaveBeenNthCalledWith(
      3,
      { tool: 'bh_test', args: { refId: 'new', role: 'button', name: 'Submit' } },
      expect.objectContaining({ stepId: 'run_1:bh_test:recovery_retry' })
    );
    const lastSetSnapshotCall = vi.mocked(d.setSnapshot).mock.calls.at(-1) as unknown as [
      string,
      { status?: string; recovery?: { action?: { type?: string } }; toolResult?: { ok?: boolean } }
    ] | undefined;
    expect(lastSetSnapshotCall?.[1]).toMatchObject({
      status: 'observed',
      recovery: { action: { type: 'find_alternative_ref' } },
      toolResult: { ok: true }
    });
  });
  it('waits for user input when no deterministic alternative ref candidate is found', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        code: ERROR_CODES.ELEMENT_NOT_FOUND,
        summary: 'old ref missing',
        changedPage: false,
        requiresObserve: true
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'observed again',
        changedPage: false,
        requiresObserve: false,
        data: {
          url: 'https://example.com',
          title: 'Example',
          currentDomain: 'example.com',
          origin: 'https://example.com',
          visibleTextSummary: '',
          pageStateSummary: '',
          refSummary: [
            { refId: 'other', role: 'link', name: 'Help', tagName: 'a', visible: true }
          ],
          warnings: []
        }
      });
    const d = deps({
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue(null)
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    await svc.execute({
      ...baseInput,
      args: { refId: 'old', role: 'button', name: 'Submit' }
    });

    expect(execute).toHaveBeenCalledTimes(2);
    const lastSetSnapshotCall = vi.mocked(d.setSnapshot).mock.calls.at(-1) as unknown as [
      string,
      { status?: string; canReviseGoal?: boolean; recovery?: { limitation?: string } }
    ] | undefined;
    expect(lastSetSnapshotCall?.[1]).toMatchObject({
      status: 'waiting_for_user',
      canReviseGoal: true,
      recovery: {
        limitation: 'No deterministic alternative ref candidate found'
      }
    });
  });
  it('writes adapter events to trace', async () => {
    const adapterWithEvents: ToolRuntimeAdapter = {
      beforeExecution: () => [{ runId: 'run_1', type: 'test_before' }],
      afterExecution: () => [{ runId: 'run_1', type: 'test_after' }],
      afterApprovalRequested: () => []
    };
    const d = deps({ adapter: adapterWithEvents });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    await svc.execute(baseInput);
    expect(d.appendTrace).toHaveBeenCalled();
  });
  it('does not parse form tool result shapes', async () => {
    const source = await import('../../../../../src/background/runtime/run/tools/tool-execution-service');
    const code = source.ToolExecutionService.toString();
    expect(code).not.toContain('FORM_FILL_FIELD');
    expect(code).not.toContain('FORM_FILL_MANY');
    expect(code).not.toContain('FORM_INFER_FILL_PLAN');
    expect(code).not.toContain('FORM_VERIFY');
  });
});
