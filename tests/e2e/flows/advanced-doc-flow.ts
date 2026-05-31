import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RuntimeToolExecutionResult } from '../../../src/runtime/runtime-messages';
import { E2EFlowContext } from './e2e-flow-context';

export class AdvancedDocFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<AdvancedDocFlow> {
    return new AdvancedDocFlow(await E2EFlowContext.create());
  }

  async expectDocToolReadsPdfFixture(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '读取 PDF 文档',
      mode: 'full',
      runKind: 'observe_only'
    });

    const result = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.DOC_READ_URL,
      args: {
        url: `${this.flowContext.origin}/manual.pdf?token=secret#page=1`,
        maxChars: 200
      }
    }));

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(JSON.stringify(result.data)).toContain('BrowserHelm PDF');
    expect(JSON.stringify(result.data)).toContain('"pageCount":1');
    expect(JSON.stringify(result.data)).toContain('"scanned":false');
    expect(JSON.stringify(result.data)).not.toContain('token=secret');
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
