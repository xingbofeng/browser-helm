import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RuntimeToolExecutionResult } from '../../../src/runtime/runtime-messages';
import { E2EFlowContext } from './e2e-flow-context';

export class AdvancedShadowFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<AdvancedShadowFlow> {
    return new AdvancedShadowFlow(await E2EFlowContext.create());
  }

  async expectShadowToolsReadRealOpenShadowRoot(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('shadow-dom.html');
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '读取 shadow DOM 控件',
      mode: 'full',
      runKind: 'observe_only'
    });

    const list = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.SHADOW_LIST,
      args: {}
    }));
    expect(list.ok).toBe(true);
    expect(JSON.stringify(list.data)).toContain('#search-widget');
    expect(JSON.stringify(list.data)).toContain('Search docs Go');

    const query = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.SHADOW_QUERY,
      args: {
        hostSelector: '#search-widget',
        selector: 'button, input'
      }
    }));
    expect(query.ok).toBe(true);
    expect(JSON.stringify(query.data)).toContain('Run search');
    expect(JSON.stringify(query.data)).toContain('Search docs');
    await expect(fixture.page.locator('x-search')).toBeVisible();
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
