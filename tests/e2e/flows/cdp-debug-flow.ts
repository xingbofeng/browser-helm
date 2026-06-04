import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RuntimeToolExecutionResult } from '../../../src/runtime/runtime-messages';
import { E2EFlowContext } from './e2e-flow-context';

export class CdpDebugFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<CdpDebugFlow> {
    return new CdpDebugFlow(await E2EFlowContext.create());
  }

  async expectAttachFailureIsActionable(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('console-network-errors.html');
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    await sidePanel.open(tabId);
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: 'CDP attach failure regression',
      mode: 'debug',
      runKind: 'observe_only'
    });

    const result = await this.approveCdpAttach(sidePanel, snapshot.runId, { tabId: 999_999_999 });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('Debugger attach failed');
    expect(JSON.stringify(result.data)).toMatch(/reason|state/u);
  }

  private async approveCdpAttach(
    sidePanel: ReturnType<E2EFlowContext['sidePanel']>,
    runId: string,
    args: Record<string, unknown>
  ): Promise<RuntimeToolExecutionResult> {
    const request = await executeToolResult(sidePanel.executeTool({
      runId,
      tool: TOOL_NAMES.CDP_ATTACH,
      args
    }));
    expect(request.ok).toBe(false);
    expect(request.requiresApproval).toBe(true);
    const pending = await sidePanel.snapshot(runId);
    expect(pending.pendingApproval?.tool).toBe(TOOL_NAMES.CDP_ATTACH);
    return executeToolResult(sidePanel.decideApproval({
      runId,
      requestId: requireApprovalId(pending.pendingApproval?.id),
      decision: 'approved',
      reason: 'e2e approve cdp attach'
    }));
  }

  async expectCdpNetworkPerformanceConsoleAndUi(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('console-network-errors.html');
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    await sidePanel.open(tabId);
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: 'CDP deep debug regression',
      mode: 'debug',
      runKind: 'observe_only'
    });

    const attach = await this.approveCdpAttach(sidePanel, snapshot.runId, {});
    expect(attach.ok).toBe(true);

    await fixture.page.evaluate(async () => {
      console.error('BrowserHelm CDP secret sk-1234567890abcdef');
      await fetch('/console-network-errors.html?token=secret#frag', {
        headers: { Authorization: 'Bearer secret-token' }
      });
      await fetch('/missing-cdp?token=secret#frag', {
        headers: { Authorization: 'Bearer secret-token' }
      }).catch(() => undefined);
    });
    await fixture.page.waitForTimeout(300);

    const network = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.CDP_GET_NETWORK_EVENTS,
      args: {}
    }));
    expect(network.ok).toBe(true);
    const requests = readArrayField(network.data, 'requests');
    expect(requests.length).toBeGreaterThanOrEqual(1);
    expect(requests.some((request) => readNestedString(request, 'requestHeadersPreview', 'Authorization') === '[MASKED]')).toBe(true);
    expect(JSON.stringify(requests)).not.toContain('secret-token');
    expect(JSON.stringify(requests)).not.toContain('token=secret');
    const failedOrError = requests.find((request) => {
      const status = readNumberField(request, 'status');
      return status !== undefined && status >= 400;
    }) ?? requests[0];
    const requestId = readStringField(failedOrError, 'requestId');
    expect(requestId).toBeTruthy();

    await this.expectDeepInspectText(snapshot.runId, /Request Inspector|请求检查器/u, /\[MASKED\]/u);

    const detail = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.CDP_GET_REQUEST_DETAIL,
      args: { requestId }
    }));
    expect(detail.ok).toBe(true);
    expect(JSON.stringify(detail.data)).not.toContain('secret-token');

    const unavailable = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.CDP_GET_RESPONSE_BODY,
      args: { requestId: 'missing-request-id' }
    }));
    expect(unavailable.ok).toBe(false);
    expect(unavailable.summary).toContain('Response body unavailable');

    const performance = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.CDP_GET_PERFORMANCE_METRICS,
      args: {}
    }));
    expect(performance.ok).toBe(true);
    expect(readArrayField(readRecordField(performance.data, 'snapshot'), 'metrics').length).toBeGreaterThan(0);
    await this.expectDeepInspectText(snapshot.runId, /Performance/u, /CDP metrics|CDP 指标/u);

    const consoleEvents = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.CDP_GET_CONSOLE_EVENTS,
      args: { limit: 20 }
    }));
    expect(consoleEvents.ok).toBe(true);
    expect(JSON.stringify(consoleEvents.data)).toContain('[MASKED]');
    await this.expectDeepInspectText(snapshot.runId, /Console Events/u, /\[MASKED\]/u);

    const detach = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.CDP_DETACH,
      args: {}
    }));
    expect(detach.ok).toBe(true);
  }

  async expectCdpAttachApprovalApproveAndDeny(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('console-network-errors.html');
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    await sidePanel.open(tabId);
    await sidePanel.setProviderSettings({
      baseUrl: `${this.flowContext.origin}/v1`,
      model: 'mock-stream',
      apiKey: 'sk-e2e-secret'
    });

    const deniedSnapshot = await sidePanel.runOnTab({
      tabId,
      task: 'CDP approval e2e deny',
      mode: 'debug',
      continueOnEmpty: true
    });
    expect(deniedSnapshot.status).toBe('waiting_for_approval');
    expect(deniedSnapshot.pendingApproval?.tool).toBe(TOOL_NAMES.CDP_ATTACH);
    const denied = await executeToolResult(sidePanel.decideApproval({
      runId: deniedSnapshot.runId,
      requestId: requireApprovalId(deniedSnapshot.pendingApproval?.id),
      decision: 'denied',
      reason: 'e2e deny cdp attach'
    }));
    expect(denied.ok).toBe(false);
    const deniedAfterDecision = await sidePanel.snapshot(deniedSnapshot.runId);
    expect(deniedAfterDecision.trace?.some((event) =>
      event.type === 'tool_result' &&
      readRecord(event.payload)?.tool === TOOL_NAMES.CDP_ATTACH &&
      readRecord(event.payload)?.ok === true
    )).toBe(false);

    const approvedSnapshot = await sidePanel.runOnTab({
      tabId,
      task: 'CDP approval e2e approve',
      mode: 'debug',
      continueOnEmpty: true
    });
    expect(approvedSnapshot.status).toBe('waiting_for_approval');
    expect(approvedSnapshot.pendingApproval?.tool).toBe(TOOL_NAMES.CDP_ATTACH);
    const approved = await executeToolResult(sidePanel.decideApproval({
      runId: approvedSnapshot.runId,
      requestId: requireApprovalId(approvedSnapshot.pendingApproval?.id),
      decision: 'approved',
      reason: 'e2e approve cdp attach'
    }));
    expect(approved.ok, JSON.stringify(approved)).toBe(true);
    expect(readNestedBoolean(approved.data, 'state', 'attached')).toBe(true);
    const approvedAfterDecision = await sidePanel.snapshot(approvedSnapshot.runId);
    expect(approvedAfterDecision.trace?.some((event) =>
      event.type === 'tool_result' &&
      readRecord(event.payload)?.tool === TOOL_NAMES.CDP_ATTACH &&
      readRecord(event.payload)?.ok === true
    )).toBe(true);

    const performance = await executeToolResult(sidePanel.executeTool({
      runId: approvedSnapshot.runId,
      tool: TOOL_NAMES.CDP_GET_PERFORMANCE_METRICS,
      args: {}
    }));
    expect(performance.ok).toBe(true);

    const detach = await executeToolResult(sidePanel.executeTool({
      runId: approvedSnapshot.runId,
      tool: TOOL_NAMES.CDP_DETACH,
      args: {}
    }));
    expect(detach.ok).toBe(true);
  }

  async expectPageHealthHookIsDebugOptIn(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('console-network-errors.html');
    await fixture.page.evaluate(() => {
      window.postMessage({
        channel: 'BROWSER_HELM_PAGE_HEALTH_EVENT',
        kind: 'network_failure',
        url: 'https://api.example.com/pre-opt-in?token=secret',
        method: 'GET',
        errorText: 'pre opt-in sk-1234567890abcdef'
      }, '*');
    });

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: 'page health opt-in regression',
      mode: 'debug',
      runKind: 'observe_only'
    });
    const health = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
      args: {}
    }));
    expect(health.ok).toBe(true);
    expect(JSON.stringify(health.data)).not.toContain('pre-opt-in');

    await fixture.page.evaluate(async () => {
      const targetUrl = `${window.location.origin}/private/path?token=secret#frag`;
      await fetch(targetUrl).catch(() => undefined);
      console.error('failed with sk-1234567890abcdef');
    });
    const updatedHealth = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
      args: {}
    }));
    expect(JSON.stringify(updatedHealth.data)).toContain('[REDACTED_PATH]');
    expect(JSON.stringify(updatedHealth.data)).toContain('[MASKED]');
    expect(JSON.stringify(updatedHealth.data)).not.toContain('token=secret');
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }

  private async expectDeepInspectText(
    runId: string,
    panelText: RegExp,
    evidenceText: RegExp
  ): Promise<void> {
    const page = await this.flowContext.sidePanel().openRun(runId);
    await page.getByRole('button', { name: /^(高级开发者选项|Advanced debug options)$/u }).click();
    await page.getByRole('button', { name: /Deep Inspect/u }).click();
    await expect(page.getByText(panelText).first()).toBeVisible();
    await expect(page.getByText(evidenceText).first()).toBeVisible();
    await page.close();
  }
}

function requireApprovalId(value: string | undefined): string {
  if (!value) {
    throw new Error('Expected a pending approval id');
  }
  return value;
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

function readArrayField(value: unknown, key: string): Record<string, unknown>[] {
  const record = readRecord(value);
  const array = record ? record[key] : undefined;
  return Array.isArray(array)
    ? array.filter((item): item is Record<string, unknown> => readRecord(item) !== undefined)
    : [];
}

function readRecordField(value: unknown, key: string): Record<string, unknown> | undefined {
  const record = readRecord(value);
  return record ? readRecord(record[key]) : undefined;
}

function readStringField(value: unknown, key: string): string {
  const record = readRecord(value);
  const field = record ? record[key] : undefined;
  return typeof field === 'string' ? field : '';
}

function readNumberField(value: unknown, key: string): number | undefined {
  const record = readRecord(value);
  const field = record ? record[key] : undefined;
  return typeof field === 'number' ? field : undefined;
}

function readNestedString(value: unknown, parentKey: string, childKey: string): string | undefined {
  const parent = readRecordField(value, parentKey);
  const field = parent ? parent[childKey] : undefined;
  return typeof field === 'string' ? field : undefined;
}

function readNestedBoolean(value: unknown, parentKey: string, childKey: string): boolean | undefined {
  const parent = readRecordField(value, parentKey);
  const field = parent ? parent[childKey] : undefined;
  return typeof field === 'boolean' ? field : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
