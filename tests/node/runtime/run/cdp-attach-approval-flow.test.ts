import { describe, expect, it, vi } from 'vitest';

import { ApprovalService } from '../../../../src/background/runtime/run/tools/approval/approval-service';
import { ToolApprovalFlowRegistry, type FlowDeps } from '../../../../src/background/runtime/run/tools/approval/tool-approval-flow-registry';
import { ApprovalManager } from '../../../../src/runtime/approval/approval-manager';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { ExecuteToolInput, RunSnapshot, RuntimeEvent } from '../../../../src/runtime/runtime-messages';
import type { ToolResult } from '../../../../src/shared/schemas/tool-result.schema';

function ok(summary: string): ToolResult {
  return {
    ok: true,
    code: ERROR_CODES.OK,
    summary,
    changedPage: false,
    requiresObserve: false
  };
}

function createCdpAttachApprovalHarness(options: {
  pendingAction?: ExecuteToolInput | undefined;
  executeTool?: ((input: ExecuteToolInput) => Promise<ToolResult>) | undefined;
} = {}) {
  const approvalManager = new ApprovalManager();
  const request = approvalManager.create({
    runId: 'run_1',
    stepId: 'run_1:bh_cdp_attach',
    tool: TOOL_NAMES.CDP_ATTACH,
    argsPreview: { tabId: 42 },
    risk: 'medium',
    reason: 'CDP attach requires approval'
  });
  const pending = new Map<string, ExecuteToolInput>();
  if (options.pendingAction) {
    pending.set(request.id, options.pendingAction);
  }
  const trace: RuntimeEvent[] = [];
  let snapshot: RunSnapshot = {
    runId: 'run_1',
    mode: 'debug',
    status: 'waiting_for_approval',
    pendingApproval: request,
    trace
  };
  const executeTool = vi.fn(options.executeTool ?? (async (input: ExecuteToolInput) =>
    ok(`executed ${input.tool} with source ${input.source ?? 'unset'}`)));
  const deletePendingAction = vi.fn((requestId: string) => {
    pending.delete(requestId);
  });
  const flowDeps: FlowDeps = {
    getRecord: () => ({ task: '连接 CDP debugger', mode: 'debug', tabId: 42, trace }),
    getPendingAction: (requestId) => pending.get(requestId),
    deletePendingAction,
    createContentRpcClient: vi.fn() as never,
    createToolRouter: vi.fn() as never,
    executeTool,
    appendTrace: (record, event) => {
      record.trace.push(event);
    },
    setSnapshot: (_runId, nextSnapshot) => {
      snapshot = nextSnapshot;
    },
    getSnapshot: () => snapshot,
    snapshotFromObserveResult: vi.fn() as never
  };
  const flowRegistry = new ToolApprovalFlowRegistry(flowDeps);
  const service = new ApprovalService({
    approvalManager,
    getRecord: flowDeps.getRecord,
    getSnapshot: flowDeps.getSnapshot,
    setSnapshot: flowDeps.setSnapshot,
    appendTrace: flowDeps.appendTrace,
    getPendingAction: flowDeps.getPendingAction,
    deletePendingAction,
    flowRegistry
  });

  return {
    request,
    service,
    executeTool,
    deletePendingAction,
    getSnapshot: () => snapshot
  };
}

describe('CDP attach approval flow', () => {
  it('executes the pending CDP attach action after approval', async () => {
    const pendingAction: ExecuteToolInput = {
      runId: 'run_1',
      tool: TOOL_NAMES.CDP_ATTACH,
      args: { tabId: 42 },
      source: 'agent'
    };
    const { request, service, executeTool } = createCdpAttachApprovalHarness({ pendingAction });

    const result = await service.decideApproval({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved'
    });

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith({
      ...pendingAction,
      source: 'runtime',
      approvalResume: true
    });
  });

  it('does not execute CDP attach when approval is denied', async () => {
    const { request, service, executeTool, deletePendingAction, getSnapshot } = createCdpAttachApprovalHarness({
      pendingAction: {
        runId: 'run_1',
        tool: TOOL_NAMES.CDP_ATTACH,
        args: { tabId: 42 }
      }
    });

    const result = await service.decideApproval({
      runId: 'run_1',
      requestId: request.id,
      decision: 'denied'
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.USER_DENIED_APPROVAL
    });
    expect(executeTool).not.toHaveBeenCalled();
    expect(deletePendingAction).toHaveBeenCalledWith(request.id);
    expect(getSnapshot()).toMatchObject({
      status: 'failed',
      pendingApproval: undefined
    });
  });

  it('fails closed when the CDP attach pending action is stale', async () => {
    const { request, service, executeTool, deletePendingAction, getSnapshot } = createCdpAttachApprovalHarness();

    const result = await service.decideApproval({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved'
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_CONTEXT_STALE
    });
    expect(executeTool).not.toHaveBeenCalled();
    expect(deletePendingAction).toHaveBeenCalledWith(request.id);
    expect(getSnapshot()).toMatchObject({
      status: 'failed',
      pendingApproval: undefined
    });
  });

  it('re-checks debugger capability during pending CDP attach execution', async () => {
    let debuggerCapabilityAvailable = false;
    const attach = vi.fn();
    const { request, service, executeTool } = createCdpAttachApprovalHarness({
      pendingAction: {
        runId: 'run_1',
        tool: TOOL_NAMES.CDP_ATTACH,
        args: { tabId: 42 }
      },
      executeTool: async () => {
        if (!debuggerCapabilityAvailable) {
          return {
            ok: false,
            code: ERROR_CODES.CAPABILITY_UNAVAILABLE,
            summary: 'Debugger permission is unavailable for bh_cdp_attach',
            changedPage: false,
            requiresObserve: false,
            error: { message: 'Debugger permission is unavailable for bh_cdp_attach' }
          };
        }
        attach();
        return ok('Debugger attached');
      }
    });

    const result = await service.decideApproval({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved'
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.CAPABILITY_UNAVAILABLE
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(attach).not.toHaveBeenCalled();

    debuggerCapabilityAvailable = true;
  });
});
