import { expect } from '@playwright/test';

import { ERROR_CODES } from '../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RuntimeToolExecutionResult } from '../../../src/runtime/runtime-messages';
import { E2EFlowContext } from './e2e-flow-context';

export class AdvancedFileFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<AdvancedFileFlow> {
    return new AdvancedFileFlow(await E2EFlowContext.create());
  }

  async expectDownloadToolsUseRealDownloadMetadata(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('downloads.html');
    const tabId = await this.flowContext.shell().activeTabId();
    const download = await Promise.all([
      fixture.page.waitForEvent('download'),
      fixture.page.locator('#download-report').click()
    ]).then(([event]) => event);
    expect(download.suggestedFilename()).toBe('report.txt');
    await download.path();

    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '列出下载文件',
      mode: 'full',
      runKind: 'observe_only'
    });

    const { list, report } = await waitForDownloadToolResult(async () => {
      const toolResult = await executeToolResult(sidePanel.executeTool({
        runId: snapshot.runId,
        tool: TOOL_NAMES.DOWNLOAD_LIST,
        args: { limit: 10 }
      }));
      const downloads = readArrayField(toolResult.data, 'downloads');
      return {
        list: toolResult,
        report: downloads.find((item) => readStringField(item, 'fileName') === 'report.txt')
      };
    });
    expect(JSON.stringify(list.data)).not.toContain('token=secret');
    expect(JSON.stringify(list.data)).not.toContain('#frag');

    const readBoundary = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.FILE_READ_DOWNLOAD,
      args: { downloadId: readNumberField(report, 'downloadId') }
    }));
    expect(readBoundary.ok).toBe(false);
    expect(readBoundary.code).toBe(ERROR_CODES.FILE_READ_UNAVAILABLE);
    expect(readBoundary.requiresApproval).toBe(true);
    expect(JSON.stringify(readBoundary.data)).toContain('report.txt');
    expect(JSON.stringify(readBoundary.data)).not.toContain('token=secret');

    const readPending = await sidePanel.snapshot(snapshot.runId);
    expect(readPending.pendingApproval?.tool).toBe(TOOL_NAMES.FILE_READ_DOWNLOAD);
    expect(JSON.stringify(readPending.pendingApproval)).not.toContain('token=secret');

    const readApproved = await executeToolResult(sidePanel.decideApproval({
      runId: snapshot.runId,
      requestId: requireApprovalId(readPending.pendingApproval?.id),
      decision: 'approved',
      reason: 'e2e approve downloaded file read boundary'
    }));
    expect(readApproved.ok).toBe(true);
    expect(readApproved.code).toBe(ERROR_CODES.OK);
    expect(JSON.stringify(readApproved)).not.toContain('token=secret');
    expect(JSON.stringify(readApproved)).not.toContain('/Users/counter');

    const uploadRequest = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL,
      args: {
        targetRefId: 'ref_upload_1',
        fileName: '/Users/counter/secret/avatar.png',
        reason: '上传头像'
      }
    }));
    expect(uploadRequest.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
    expect(uploadRequest.requiresApproval).toBe(true);
    expect(JSON.stringify(uploadRequest)).toContain('avatar.png');
    expect(JSON.stringify(uploadRequest)).not.toContain('/Users/counter');

    const uploadPending = await sidePanel.snapshot(snapshot.runId);
    expect(uploadPending.pendingApproval?.tool).toBe(TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL);
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

function readArrayField(value: unknown, key: string): Record<string, unknown>[] {
  const record = readRecord(value);
  const array = record ? record[key] : undefined;
  return Array.isArray(array)
    ? array.filter((item): item is Record<string, unknown> => readRecord(item) !== undefined)
    : [];
}

function readNumberField(value: unknown, key: string): number | undefined {
  const record = readRecord(value);
  const field = record ? record[key] : undefined;
  return typeof field === 'number' ? field : undefined;
}

function readStringField(value: unknown, key: string): string | undefined {
  const record = readRecord(value);
  const field = record ? record[key] : undefined;
  return typeof field === 'string' ? field : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

async function waitForDownloadToolResult(
  read: () => Promise<{ list: RuntimeToolExecutionResult; report: Record<string, unknown> | undefined }>
): Promise<{ list: RuntimeToolExecutionResult; report: Record<string, unknown> }> {
  const deadline = Date.now() + 5000;
  let latest: { list: RuntimeToolExecutionResult; report: Record<string, unknown> | undefined } | undefined;
  while (Date.now() < deadline) {
    latest = await read();
    if (latest.list.ok && latest.report) {
      return { list: latest.list, report: latest.report };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Download metadata did not appear in chrome.downloads history: ${JSON.stringify(latest?.list.data)}`);
}
