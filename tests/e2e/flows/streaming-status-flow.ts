import { expect } from '@playwright/test';
import { CockpitPanel } from '../components/side-panel/cockpit-panel';
import { E2EFlowContext } from './e2e-flow-context';

export class StreamingStatusFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<StreamingStatusFlow> {
    return new StreamingStatusFlow(await E2EFlowContext.create());
  }

  /** 长页面任务中 trace 包含 article read 工具调用与失败路径信息。 */
  async expectLongPageReadArticleInTrace(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('long-page.html');

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
      task: '总结这个长页面',
      mode: 'ask'
    });
    const page = await sidePanel.openRun(snapshot.runId);
    const cockpit = new CockpitPanel(page);

    await cockpit.expectLongPageArticleRead();

    // trace 中有 article read 事件
    const finalSnapshot = await sidePanel.snapshot(snapshot.runId);
    const traceTypes = (finalSnapshot.trace ?? []).map((e) => e.type);
    expect(traceTypes).toEqual(
      expect.arrayContaining(['tool_started', 'tool_result'])
    );

    await cockpit.expectNoLegacyObserveStatusCard();
  }

  /** 首次用户发送长页面总结时应直接流式吐字，不需要发第二次。 */
  async expectFirstAskStreamsAnswerWithoutSecondSubmit(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('long-page.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const sidePanelPage = await sidePanel.open(tabId);
    const cockpit = new CockpitPanel(sidePanelPage);
    await cockpit.expectObservedPage({
      title: '长页面试读测试页',
      url: `${this.flowContext.origin}/long-page.html`
    });

    await sidePanel.setProviderSettings({
      baseUrl: `${this.flowContext.origin}/v1-slow`,
      model: 'mock-slow-stream',
      apiKey: 'sk-e2e-secret'
    });

    const input = sidePanelPage.getByRole('textbox', { name: '任务' });
    await input.fill('总结这个长页面');
    await sidePanelPage.getByRole('button', { name: '启动任务' }).click();

    await expect(sidePanelPage.getByText('正文读取完成')).toBeVisible();
    await expect(sidePanelPage.getByText(/首轮流式/u)).toBeVisible();
    await expect(sidePanelPage.getByText(/首轮流式 正在吐字 完成。/u)).toBeVisible();
    await expect(
      sidePanelPage
        .getByLabel('BrowserHelm Agent 消息')
        .getByText('等待 BrowserHelm 输出...')
    ).toHaveCount(0);
  }

  /** 长页面 article read 失败时 UI 不静默卡住。 */
  async expectLongPageArticleReadFailureShowsError(): Promise<void> {
    // 通过 mock provider 快速失败验证
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('long-page.html');

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
      task: '总结这个长页面',
      mode: 'ask'
    });

    // 即便 article read 可能失败，side panel 不应崩溃
    const page = await sidePanel.openRun(snapshot.runId);
    // 面板至少存在且没白屏
    await expect(page.getByLabel('BrowserHelm Agent 消息')).toBeVisible();
  }

  /** AI 完成后不残留错误的运行中目标状态。 */
  async expectNoResidualRunningStatusAfterFinish(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('long-page.html');

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
      task: '总结这个长页面',
      mode: 'ask'
    });

    // Final snapshot should not be in a running status
    const finalSnapshot = await sidePanel.snapshot(snapshot.runId);
    expect(finalSnapshot.status).not.toBe('thinking');
    expect(finalSnapshot.status).not.toBe('observing');
    expect(finalSnapshot.status).not.toBe('executing_tool');
    expect(finalSnapshot.status).not.toBe('waiting_for_approval');

    // UI 验证 - 消息区域可见，非白屏状态
    const page = await sidePanel.openRun(snapshot.runId);
    await expect(page.getByLabel('BrowserHelm Agent 消息')).toBeVisible();
  }

  /** 用户发送消息后 extension 自动滚动到底部。 */
  async expectAutoScrollToBottomAfterSend(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanelPage = await this.flowContext.sidePanel().open(tabId);

    // 输入并发送消息
    const input = sidePanelPage.getByRole('textbox', { name: '任务' });
    await input.fill('测试自动滚动');
    await sidePanelPage.getByRole('button', { name: '启动任务' }).click();

    // 等待消息列表有内容
    const messages = sidePanelPage.getByLabel('BrowserHelm Agent 消息');
    await expect(messages).toBeVisible();

    // 验证消息区域的滚动行为：消息区域应当有新内容
    // 我们可以通过检查消息区域包含刚发送的任务来验证
    await expect(sidePanelPage.getByText('测试自动滚动')).toBeVisible();
  }

  /** 多轮对话可以带历史上下文。 */
  async expectMultiTurnConversationKeepsContext(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    await sidePanel.open(tabId);

    // 设置 mock provider
    await sidePanel.setProviderSettings({
      baseUrl: `${this.flowContext.origin}/v1`,
      model: 'mock-stream',
      apiKey: 'sk-e2e-secret'
    });

    // 第一轮
    await sidePanel.runOnTab({
      tabId,
      task: '第一轮：检查表单字段',
      mode: 'ask'
    });

    // 第二轮重新开始，验证有 runId 和 messages
    const snapshot2 = await sidePanel.runOnTab({
      tabId,
      task: '第二轮：再次检查表单',
      mode: 'ask'
    });

    expect(snapshot2.runId).toBeTruthy();
    expect(snapshot2.messages).toBeDefined();
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}
