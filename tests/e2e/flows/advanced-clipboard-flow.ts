import { expect } from '@playwright/test';

import { ERROR_CODES } from '../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RuntimeToolExecutionResult } from '../../../src/runtime/runtime-messages';
import { E2EFlowContext } from './e2e-flow-context';

export class AdvancedClipboardFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<AdvancedClipboardFlow> {
    return new AdvancedClipboardFlow(await E2EFlowContext.create());
  }

  async expectClipboardReadWriteRequiresApprovalAndUsesOffscreenBridge(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '写入并读取剪贴板',
      mode: 'full',
      runKind: 'observe_only'
    });

    const text = `BrowserHelm clipboard ${Date.now()}`;
    const writeRequest = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL,
      args: { text }
    }));
    expect(writeRequest.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
    expect(JSON.stringify(writeRequest)).not.toContain(text);

    const writePending = await sidePanel.snapshot(snapshot.runId);
    expect(writePending.pendingApproval?.tool).toBe(TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL);
    const writeApproved = await executeToolResult(sidePanel.decideApproval({
      runId: snapshot.runId,
      requestId: requireApprovalId(writePending.pendingApproval?.id),
      decision: 'approved',
      reason: 'e2e approve clipboard write'
    }));
    if (!writeApproved.ok) {
      throw new Error(`Clipboard write approval failed: ${JSON.stringify(writeApproved)}`);
    }
    expect(JSON.stringify(writeApproved)).not.toContain(text);

    const readRequest = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.CLIPBOARD_READ_WITH_APPROVAL,
      args: {}
    }));
    expect(readRequest.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);

    const readPending = await sidePanel.snapshot(snapshot.runId);
    const readApproved = await executeToolResult(sidePanel.decideApproval({
      runId: snapshot.runId,
      requestId: requireApprovalId(readPending.pendingApproval?.id),
      decision: 'approved',
      reason: 'e2e approve clipboard read'
    }));
    expect(readApproved.ok).toBe(true);
    expect(JSON.stringify(readApproved.data)).toContain(text);

    const finalSnapshot = await sidePanel.snapshot(snapshot.runId);
    expect(JSON.stringify(finalSnapshot.toolResult?.detail)).not.toContain(text);
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
