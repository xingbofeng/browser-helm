import { expect } from '@playwright/test';

import { ERROR_CODES } from '../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RuntimeToolExecutionResult } from '../../../src/runtime/runtime-messages';
import { E2EFlowContext } from './e2e-flow-context';

export class AdvancedStorageFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<AdvancedStorageFlow> {
    return new AdvancedStorageFlow(await E2EFlowContext.create());
  }

  async expectStorageToolsReadRealPageStorageSafely(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');
    await fixture.page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('authToken', 'secret-token-value');
      sessionStorage.setItem('wizardStep', 'shipping');
    });
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '检查 localStorage 和 sessionStorage 状态',
      mode: 'full',
      runKind: 'observe_only'
    });

    const list = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.STORAGE_LIST,
      args: { area: 'localStorage', limit: 10 }
    }));
    expect(list.ok).toBe(true);
    expect(JSON.stringify(list.data)).toContain('theme');
    expect(JSON.stringify(list.data)).toContain('authToken');
    expect(JSON.stringify(list.data)).toContain('dark');
    expect(JSON.stringify(list.data)).not.toContain('secret-token-value');

    const getSession = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.STORAGE_GET,
      args: { area: 'sessionStorage', key: 'wizardStep' }
    }));
    expect(getSession.ok).toBe(true);
    expect(JSON.stringify(getSession.data)).toContain('shipping');
  }

  async expectStorageMutationRequiresApprovalAndChangesStorageAfterApproval(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');
    await fixture.page.evaluate(() => {
      localStorage.setItem('theme', 'light');
    });
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '审批后把 localStorage theme 写成 dark',
      mode: 'full',
      runKind: 'observe_only'
    });

    const setRequest = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
      args: { area: 'localStorage', key: 'theme', value: 'dark' }
    }));
    expect(setRequest.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
    expect(await fixture.page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

    const pending = await sidePanel.snapshot(snapshot.runId);
    expect(pending.pendingApproval?.tool).toBe(TOOL_NAMES.STORAGE_SET_WITH_APPROVAL);
    const approved = await executeToolResult(sidePanel.decideApproval({
      runId: snapshot.runId,
      requestId: requireApprovalId(pending.pendingApproval?.id),
      decision: 'approved',
      reason: 'e2e approve storage set'
    }));

    expect(approved.ok).toBe(true);
    expect(approved.changedPage).toBe(true);
    expect(approved.requiresObserve).toBe(true);
    expect(await fixture.page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    const finalSnapshot = await sidePanel.snapshot(snapshot.runId);
    expect(JSON.stringify(finalSnapshot.toolResult?.detail)).not.toContain('"dark"');
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}

async function executeToolResult(
  promise: Promise<unknown>
): Promise<RuntimeToolExecutionResult> {
  const result = await promise;
  if (
    typeof result !== 'object' ||
    result === null ||
    typeof (result as RuntimeToolExecutionResult).ok !== 'boolean' ||
    typeof (result as RuntimeToolExecutionResult).code !== 'string'
  ) {
    throw new Error('Unexpected runtime tool result');
  }
  return result as RuntimeToolExecutionResult;
}

function requireApprovalId(value: string | undefined): string {
  if (!value) {
    throw new Error('Expected a pending approval id');
  }
  return value;
}
