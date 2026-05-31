import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RuntimeToolExecutionResult } from '../../../src/runtime/runtime-messages';
import { E2EFlowContext } from './e2e-flow-context';

export class AdvancedTabFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<AdvancedTabFlow> {
    return new AdvancedTabFlow(await E2EFlowContext.create());
  }

  async expectTabToolsListAndFocusRealTabs(): Promise<void> {
    const first = await this.flowContext.fixturePage();
    await first.goto('basic-form.html?token=secret#first');
    const firstTabId = await this.flowContext.shell().activeTabId();

    const second = await this.flowContext.fixturePage();
    await second.goto('vision-overlay.html?token=secret#second');
    const secondTabId = await this.flowContext.shell().activeTabId();

    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId: secondTabId,
      task: '列出标签页并切换到第一个 fixture',
      mode: 'full',
      runKind: 'observe_only'
    });

    const list = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.TAB_LIST,
      args: {}
    }));
    expect(list.ok).toBe(true);
    const tabs = readArrayField(list.data, 'tabs');
    expect(tabs.some((tab) => readNumberField(tab, 'tabId') === firstTabId)).toBe(true);
    expect(tabs.some((tab) => readNumberField(tab, 'tabId') === secondTabId)).toBe(true);
    expect(JSON.stringify(list.data)).not.toContain('token=secret');
    expect(JSON.stringify(list.data)).not.toContain('#second');

    const focus = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.TAB_FOCUS,
      args: { tabId: firstTabId }
    }));
    expect(focus.ok).toBe(true);
    expect(focus.requiresObserve).toBe(true);
    await expect.poll(async () => this.flowContext.shell().activeTabId()).toBe(firstTabId);
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

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}
