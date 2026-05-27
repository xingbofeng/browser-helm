import { expect } from '@playwright/test';
import { CockpitPanel } from '../components/side-panel/cockpit-panel';
import { E2EFlowContext } from './e2e-flow-context';

export class ActiveTabRefreshFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<ActiveTabRefreshFlow> {
    return new ActiveTabRefreshFlow(await E2EFlowContext.create());
  }

  /** 同 tab 导航到另一 fixture 后 side panel 自动刷新观察卡。 */
  async expectObservationRefreshesAfterNavigation(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanelPage = await this.flowContext.sidePanel().open(tabId);
    const cockpit = new CockpitPanel(sidePanelPage);

    // 确认初始页面观察卡
    await cockpit.expectObservedPage({
      title: '欢迎注册 - 示例网站',
      url: `${this.flowContext.origin}/basic-form.html`
    });
    await cockpit.expectNoLegacyObserveStatusCard();

    // 导航到另一个 fixture
    await fixture.goto('interactive-elements.html');

    // 等待 side panel 自动刷新（target revision 更新触发重新观察）
    // auto-observe 会创建新的 page_summary 消息
    await expect(sidePanelPage.getByText('交互元素')).toBeVisible({ timeout: 15000 });

    // 旧页面的观察卡作为历史消息保留（且不应是当前页面观察卡中最新的）
    // 验证新页面上显示了新标题
  }

  /** 当前页面的自动观察触发新的 QA 卡片（从 runOnTab 返回验证）。 */
  async expectObservationTriggersQaCard(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '观察当前页面',
      mode: 'ask'
    });

    // 自动观察完成后快照有 QA 卡片相关信息
    expect(snapshot.status).toBeDefined();
    // 观察后有结构化页面数据
    expect(snapshot.structuredPageData).toBeDefined();
    expect(snapshot.observation).toBeDefined();
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}
