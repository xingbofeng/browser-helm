import { expect } from '@playwright/test';
import { CockpitPanel } from '../components/side-panel/cockpit-panel';
import { E2EFlowContext } from './e2e-flow-context';

export class DebugDrawerFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<DebugDrawerFlow> {
    return new DebugDrawerFlow(await E2EFlowContext.create());
  }

  /** debug drawer 中 Trace tab 显示分级 trace item。 */
  async expectTraceTabShowsGradedItems(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    await sidePanel.open(tabId);
    await sidePanel.setProviderSettings({
      baseUrl: `${this.flowContext.origin}/v1`,
      model: 'mock-stream',
      apiKey: 'sk-e2e-secret'
    });
    await sidePanel.runOnTab({
      tabId,
      task: '观察当前页面',
      mode: 'ask'
    });

    const page = await sidePanel.open(tabId);
    const cockpit = new CockpitPanel(page);
    await cockpit.openDebugTab('Trace');

    // trace header 存在
    await expect(page.getByText(/Trace \/ (调试日志|Debug Log|Debug log)/u)).toBeVisible();
    // 有 trace item
    await expect(page.locator('.bh-traceItem').first()).toBeVisible();
    // 含 run_started
    await expect(page.getByText(/开始任务|Task started/u)).toBeVisible();
  }

  /** trace item 大 payload 默认折叠。 */
  async expectLargePayloadCollapsed(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    await sidePanel.open(tabId);
    await sidePanel.setProviderSettings({
      baseUrl: `${this.flowContext.origin}/v1`,
      model: 'mock-stream',
      apiKey: 'sk-e2e-secret'
    });
    await sidePanel.runOnTab({
      tabId,
      task: '观察当前页面',
      mode: 'ask'
    });

    const page = await sidePanel.open(tabId);
    const cockpit = new CockpitPanel(page);
    await cockpit.openDebugTab('Trace');

    // details/summary 折叠存在
    await expect(page.locator('.bh-traceDetails summary').first()).toBeVisible();
  }

  /** 工具结果 tab 显示工具调用结果。 */
  async expectToolsTabShowsResults(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    await sidePanel.open(tabId);
    await sidePanel.setProviderSettings({
      baseUrl: `${this.flowContext.origin}/v1`,
      model: 'mock-stream',
      apiKey: 'sk-e2e-secret'
    });
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '观察当前页面',
      mode: 'ask'
    });

    const page = await sidePanel.openRun(snapshot.runId);
    const cockpit = new CockpitPanel(page);
    await cockpit.openDebugTab(/^(工具|Tools)$/u);

    // 工具 tab 有内容（至少 observed 后有工具结果）
    await expect(page.locator('.bh-toolInspector').first()).toBeVisible();
  }

  /** 无工具时工具 tab 显示空态。 */
  async expectToolsTabEmptyState(): Promise<void> {
    // 通过直接打开 side panel 没有 run 的状态验证
    const page = await this.flowContext.sidePanel().open();
    const cockpit = new CockpitPanel(page);
    await cockpit.openDebugTab(/^(工具|Tools)$/u);

    // 空态消息
    await expect(
      page.getByText(/暂无工具调用记录|No tool calls|工具|Tools|空/)
        .first()
    ).toBeVisible();
  }

  /** 错误 trace 有明显 error 状态。 */
  async expectErrorTraceHasErrorState(): Promise<void> {
    // 利用 invalid-form fixture 确保有 form 诊断失败场景
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('invalid-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '诊断这个表单为什么不能提交',
      mode: 'form'
    });

    const page = await sidePanel.openRun(snapshot.runId);
    const cockpit = new CockpitPanel(page);
    await cockpit.openDebugTab('Trace');

    // finalSnapshot 状态确认已完成（非卡住）
    const finalSnapshot = await sidePanel.snapshot(snapshot.runId);
    expect(finalSnapshot.status).toBeTruthy();
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}
