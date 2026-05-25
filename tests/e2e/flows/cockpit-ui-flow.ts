import { CockpitPanel } from '../components/side-panel/cockpit-panel';
import { ERROR_CODES } from '../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import { E2EFlowContext } from './e2e-flow-context';
import { findFrameRef } from './page-observation-flow';

export class CockpitUiFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<CockpitUiFlow> {
    return new CockpitUiFlow(await E2EFlowContext.create());
  }

  async expectCockpitAutoObservationAndStop(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanelPage = await this.flowContext.sidePanel().open(tabId);
    const cockpit = new CockpitPanel(sidePanelPage);

    await cockpit.expectShell();
    await cockpit.expectObservedPage({
      title: '欢迎注册 - 示例网站',
      url: `${this.flowContext.origin}/basic-form.html`
    });
    await cockpit.expectObservationTimelineSteps();
    await cockpit.stopRun();
    await cockpit.expectCancelled();
  }

  async expectApprovalDrawerFromPendingRuntimeRequest(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('iframe-form-host.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '审批 iframe 高风险按钮',
      mode: 'act'
    });
    const deleteRef = findFrameRef(snapshot.refs, {
      role: 'button',
      name: '删除账号'
    });
    await sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.IFRAME_CLICK,
      args: {
        refId: `frame_${deleteRef.frameId}:${deleteRef.innerRefId}`
      }
    });

    const approvalPage = await sidePanel.openRun(snapshot.runId);
    await new CockpitPanel(approvalPage).expectApprovalDrawer({
      action: 'Click Iframe Target',
      code: ERROR_CODES.APPROVAL_REQUIRED
    });
  }

  async expectSettingsMaskProviderKey(): Promise<void> {
    const page = await this.flowContext.sidePanel().open();
    const cockpit = new CockpitPanel(page);
    await cockpit.saveProviderSettings({
      baseUrl: 'https://api.e2e.example/v1',
      model: 'gpt-e2e',
      apiKey: 'sk-e2e-secret'
    });
    await page.reload();
    await cockpit.expectSettingsMasking({
      baseUrl: 'https://api.e2e.example/v1',
      model: 'gpt-e2e'
    });
    await cockpit.saveProviderSettings({
      baseUrl: 'https://api.e2e.example/v2',
      model: 'gpt-e2e-next'
    });
    await page.reload();
    await cockpit.expectSettingsMasking({
      baseUrl: 'https://api.e2e.example/v2',
      model: 'gpt-e2e-next'
    });
  }

  async expectV1FormDoctorDiagnosis(): Promise<void> {
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

    await new CockpitPanel(page).expectDiagnosisOverview({
      modeText: '用户显式选择 form mode',
      reportTitle: 'Form Doctor 诊断报告',
      finding: '字段校验失败'
    });
  }

  async expectV1PageInspectorDiagnosis(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('console-network-errors.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '检查这个页面有什么错误',
      mode: 'debug'
    });
    const page = await sidePanel.openRun(snapshot.runId);

    await new CockpitPanel(page).expectDiagnosisOverview({
      modeText: '用户显式选择 debug mode',
      reportTitle: 'Page Inspector 诊断报告',
      limitation: '暂未收集到可汇总的浅层 debug finding'
    });
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}
