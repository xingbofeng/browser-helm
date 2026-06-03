import { describe, expect, it, vi } from 'vitest';

import { WorkflowReplayApprovalFlow } from '../../../../src/background/runtime/run/tools/approval/flows/workflow-replay-approval-flow';
import { defaultWorkflowRepo } from '../../../../src/storage/workflow-repo';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { ToolRouter } from '../../../../src/tools/core/tool-router';
import type { RunSnapshot, RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('WorkflowReplayApprovalFlow', () => {
  it('executes approved workflow steps through runtime tool execution and scores success', async () => {
    const workflow = defaultWorkflowRepo.save({
      domain: 'app.example.com',
      origin: 'https://app.example.com',
      urlPattern: 'https://app.example.com/dashboard',
      requiredPageTitleHints: ['Dashboard'],
      requiredPageTextHints: ['Ready'],
      completionEvidence: ['Dashboard refreshed'],
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
    const record: { task: string; mode: 'ask'; tabId: number; trace: RuntimeEvent[] } = {
      task: 'Refresh page',
      mode: 'ask',
      tabId: 1,
      trace: []
    };
    let snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'waiting_for_approval',
      observation: {
        url: 'https://app.example.com/dashboard',
        title: 'Dashboard',
        currentDomain: 'app.example.com',
        origin: 'https://app.example.com',
        visibleTextSummary: 'Ready to refresh',
        pageStateSummary: 'Dashboard page',
        interactiveCount: 1,
        warnings: []
      }
    };
    const executeTool = vi.fn().mockImplementation(async () => {
      snapshot = {
        ...snapshot,
        observation: {
          ...snapshot.observation!,
          visibleTextSummary: 'Dashboard refreshed',
          pageStateSummary: 'Dashboard page refreshed'
        }
      };
      return {
      ok: true,
      code: 'OK',
      summary: 'Observed',
      changedPage: false,
      requiresObserve: false
      };
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
    expect(record.trace.some((event) =>
      event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
      isRecord(event.payload) &&
      event.payload.tool === TOOL_NAMES.FLOW_SCORE &&
      event.payload.ok === true
    )).toBe(true);
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

  it('stops before the first step when page preconditions do not match', async () => {
    const workflow = defaultWorkflowRepo.save({
      domain: 'app.example.com',
      origin: 'https://app.example.com',
      urlPattern: 'https://app.example.com/billing/*',
      requiredPageTitleHints: ['Billing'],
      requiredPageTextHints: ['Monthly invoice'],
      completionEvidence: ['Monthly invoice downloaded'],
      intent: 'Download invoice',
      taskDescription: 'Download the billing invoice',
      steps: [{
        id: 'step_1',
        tool: TOOL_NAMES.PAGE_OBSERVE,
        summary: 'Observe page',
        args: {},
        risk: 'safe',
        requiresApproval: false
      }]
    });
    const record = { task: 'Download invoice', mode: 'ask' as const, tabId: 1, trace: [] };
    let snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'waiting_for_approval',
      observation: {
        url: 'https://app.example.com/settings',
        title: 'Settings',
        currentDomain: 'app.example.com',
        origin: 'https://app.example.com',
        visibleTextSummary: 'Profile settings',
        pageStateSummary: 'Settings page',
        interactiveCount: 1,
        warnings: []
      }
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

    expect(result.ok).toBe(false);
    expect(result.code).toBe('WORKFLOW_PRECONDITION_FAILED');
    expect(result.summary).toContain('url_pattern');
    expect(executeTool).not.toHaveBeenCalled();
    expect(defaultWorkflowRepo.get(workflow.id)?.failureCount).toBe(1);
    defaultWorkflowRepo.delete(workflow.id);
  });

  it('accepts replay when the adapter id and version match the workflow binding', async () => {
    const workflow = defaultWorkflowRepo.save({
      domain: 'github.com',
      adapter: { id: 'github', version: '2026.06' },
      completionEvidence: ['Issue created'],
      intent: 'Create GitHub issue',
      taskDescription: 'Create an issue from a saved workflow',
      steps: [{
        id: 'step_1',
        tool: TOOL_NAMES.PAGE_OBSERVE,
        summary: 'Observe issue page',
        args: {},
        risk: 'safe',
        requiresApproval: false
      }]
    });
    const record = { task: 'Create GitHub issue', mode: 'ask' as const, tabId: 1, trace: [] };
    let snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'waiting_for_approval',
      observation: {
        url: 'https://github.com/org/repo/issues',
        title: 'Issues',
        currentDomain: 'github.com',
        origin: 'https://github.com',
        visibleTextSummary: 'New issue',
        pageStateSummary: 'Issues list',
        interactiveCount: 1,
        warnings: []
      },
      domainAdapter: {
        enabled: true,
        id: 'github',
        version: '2026.06',
        label: 'GitHub',
        workflowCount: 1,
        locatorCount: 1,
        approvalEnforced: true
      }
    };
    const executeTool = vi.fn().mockImplementation(async () => {
      snapshot = {
        ...snapshot,
        observation: {
          ...snapshot.observation!,
          visibleTextSummary: 'Issue created',
          pageStateSummary: 'Issue confirmation'
        }
      };
      return {
        ok: true,
        code: 'OK',
        summary: 'Observed issue confirmation',
        changedPage: false,
        requiresObserve: false
      };
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
    expect(defaultWorkflowRepo.get(workflow.id)?.successCount).toBe(1);
    defaultWorkflowRepo.delete(workflow.id);
  });

  it('scores failed after replay when completion evidence is missing', async () => {
    const workflow = defaultWorkflowRepo.save({
      domain: 'app.example.com',
      completionEvidence: ['Monthly invoice downloaded'],
      intent: 'Download invoice',
      taskDescription: 'Download the billing invoice',
      steps: [{
        id: 'step_1',
        tool: TOOL_NAMES.PAGE_OBSERVE,
        summary: 'Observe page',
        args: {},
        risk: 'safe',
        requiresApproval: false
      }]
    });
    const record = { task: 'Download invoice', mode: 'ask' as const, tabId: 1, trace: [] };
    let snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'waiting_for_approval',
      observation: {
        url: 'https://app.example.com/billing',
        title: 'Billing',
        currentDomain: 'app.example.com',
        origin: 'https://app.example.com',
        visibleTextSummary: 'Invoice list',
        pageStateSummary: 'Billing page',
        interactiveCount: 1,
        warnings: []
      }
    };
    const executeTool = vi.fn().mockImplementation(async () => {
      snapshot = {
        ...snapshot,
        observation: {
          ...snapshot.observation!,
          visibleTextSummary: 'Invoice list',
          pageStateSummary: 'Still on billing page'
        }
      };
      return {
        ok: true,
        code: 'OK',
        summary: 'Observed',
        changedPage: false,
        requiresObserve: false
      };
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

    expect(result.ok).toBe(false);
    expect(result.code).toBe('WORKFLOW_POSTCONDITION_FAILED');
    expect(defaultWorkflowRepo.get(workflow.id)).toMatchObject({
      successCount: 0,
      failureCount: 1
    });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
