import { describe, expect, it, vi } from 'vitest';
import { ToolExecutionService } from '../../../../../src/background/runtime/run/tools/tool-execution-service';
import type { ToolExecutionDeps } from '../../../../../src/background/runtime/run/tools/tool-execution-service';
import type { ToolRuntimeAdapter } from '../../../../../src/background/runtime/run/tools/adapters/tool-runtime-adapter';
import { ERROR_CODES } from '../../../../../src/shared/constants/error-codes';
import type { RunMode } from '../../../../../src/shared/schemas/tool.schema';

const noopAdapter: ToolRuntimeAdapter = {
  beforeExecution: () => [],
  afterExecution: () => [],
  afterApprovalRequested: () => []
};

const baseInput = { runId: 'run_1', tool: 'bh_test', args: {} };

function deps(overrides = {}) {
  return {
    getSnapshot: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'ask', status: 'observed' as const }),
    getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'ask' as RunMode, tabId: 42, trace: [], skipProviderResponse: false }),
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
    const d = deps({ getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'ask', trace: [], skipProviderResponse: false }) });
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
