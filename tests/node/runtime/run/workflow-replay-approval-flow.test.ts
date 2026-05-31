import { describe, expect, it, vi } from 'vitest';

import { WorkflowReplayApprovalFlow } from '../../../../src/background/runtime/run/tools/approval/flows/workflow-replay-approval-flow';
import { defaultWorkflowRepo } from '../../../../src/storage/workflow-repo';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { ToolRouter } from '../../../../src/tools/core/tool-router';
import type { RunSnapshot } from '../../../../src/runtime/runtime-messages';

describe('WorkflowReplayApprovalFlow', () => {
  it('executes approved workflow steps through runtime tool execution and scores success', async () => {
    const workflow = defaultWorkflowRepo.save({
      domain: 'app.example.com',
      intent: 'Refresh page',
      taskDescription: 'Observe current page',
      steps: [{
        id: 'step_1',
        tool: TOOL_NAMES.PAGE_OBSERVE,
        summary: 'Observe page',
        args: {},
        risk: 'safe',
        requiresApproval: false
      }]
    });
    const record = { task: 'Refresh page', mode: 'ask' as const, tabId: 1, trace: [] };
    let snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'waiting_for_approval'
    };
    const executeTool = vi.fn().mockResolvedValue({
      ok: true,
      code: 'OK',
      summary: 'Observed',
      changedPage: false,
      requiresObserve: false
    });
    const flow = new WorkflowReplayApprovalFlow({
      getRecord: () => record,
      getPendingAction: () => ({
        runId: 'run_1',
        tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
        args: { id: workflow.id }
      }),
      deletePendingAction: vi.fn(),
      createToolRouter: () => fakeRouter(true),
      executeTool,
      appendTrace: (target, event) => target.trace.push(event),
      setSnapshot: (_runId, next) => {
        snapshot = next;
      },
      getSnapshot: () => snapshot
    });

    const result = await flow.onApproved({
      runId: 'run_1',
      requestId: 'req_1',
      tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL
    });

    expect(result.ok).toBe(true);
    expect(executeTool).toHaveBeenCalledWith({
      runId: 'run_1',
      tool: TOOL_NAMES.PAGE_OBSERVE,
      args: {}
    });
    expect(defaultWorkflowRepo.get(workflow.id)?.successCount).toBe(1);
    expect(snapshot.status).toBe('finished');
    defaultWorkflowRepo.delete(workflow.id);
  });

  it('stops before executing a step that is not available in the run mode', async () => {
    const workflow = defaultWorkflowRepo.save({
      domain: 'app.example.com',
      intent: 'Click unsafe target',
      taskDescription: 'Click a button',
      steps: [{
        id: 'step_1',
        tool: TOOL_NAMES.ACTION_CLICK,
        summary: 'Click button',
        args: { refId: 'ref_1' },
        risk: 'medium',
        requiresApproval: false
      }]
    });
    const record = { task: 'Click unsafe target', mode: 'ask' as const, tabId: 1, trace: [] };
    let snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'waiting_for_approval'
    };
    const executeTool = vi.fn();
    const flow = new WorkflowReplayApprovalFlow({
      getRecord: () => record,
      getPendingAction: () => ({
        runId: 'run_1',
        tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
        args: { id: workflow.id }
      }),
      deletePendingAction: vi.fn(),
      createToolRouter: () => fakeRouter(false),
      executeTool,
      appendTrace: (target, event) => target.trace.push(event),
      setSnapshot: (_runId, next) => {
        snapshot = next;
      },
      getSnapshot: () => snapshot
    });

    const result = await flow.onApproved({
      runId: 'run_1',
      requestId: 'req_1',
      tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL
    });

    expect(result.ok).toBe(false);
    expect(executeTool).not.toHaveBeenCalled();
    expect(snapshot.status).toBe('error');
    defaultWorkflowRepo.delete(workflow.id);
  });
});

function fakeRouter(hasContract: boolean): ToolRouter {
  return {
    getToolContract: () => hasContract ? {
      name: TOOL_NAMES.PAGE_OBSERVE,
      title: 'Page Observe',
      description: 'Observe page',
      modes: ['ask'],
      risk: 'safe',
      argsSchema: {},
      readOnly: true,
      requiresApproval: false,
      contextVisibility: 'summary'
    } : undefined
  } as unknown as ToolRouter;
}
