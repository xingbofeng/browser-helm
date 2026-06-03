import { expect } from '@playwright/test';
import { CockpitPanel } from '../components/side-panel/cockpit-panel';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RuntimeToolExecutionResult, RunSnapshot } from '../../../src/runtime/runtime-messages';
import type { FormFieldSnapshot } from '../../../src/shared/schemas/structured-page-data.schema';
import { E2EFlowContext } from './e2e-flow-context';
import { findFrameRef } from './page-observation-flow';

export class CockpitUiFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<CockpitUiFlow> {
    return new CockpitUiFlow(await E2EFlowContext.create());
  }

  async expectCockpitAutoObservation(): Promise<void> {
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
    await cockpit.expectNoLegacyObserveStatusCard();
    await cockpit.expectNoObserveStatusCards();
  }

  async expectHeaderScreenshotCapture(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanelPage = await this.flowContext.sidePanel().open(tabId);
    const cockpit = new CockpitPanel(sidePanelPage);

    await cockpit.expectShell();
    await cockpit.captureViewportFromHeader();
  }

  async expectNarrowSidePanelLayoutAndNativeBinding(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanelPage = await this.flowContext.sidePanel().open(tabId);
    await sidePanelPage.setViewportSize({ width: 390, height: 820 });
    const cockpit = new CockpitPanel(sidePanelPage);

    await cockpit.expectShell();
    await cockpit.expectObservedPage({
      title: '欢迎注册 - 示例网站',
      url: `${this.flowContext.origin}/basic-form.html`
    });
    await expect(sidePanelPage.getByText(
      /未检测到表单|表单可提交|校验异常|提交禁用|No form detected|Form valid|Validation issues|Submit disabled/u
    ).first()).toBeVisible();
    const screenshot = await sidePanelPage.screenshot({ fullPage: false });
    expect(screenshot.length).toBeGreaterThan(10_000);

    const layout = await sidePanelPage.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      return {
        viewportWidth: window.innerWidth,
        documentScrollWidth: root.scrollWidth,
        bodyScrollWidth: body.scrollWidth
      };
    });
    expect(layout.viewportWidth).toBe(390);
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(400);
    expect(layout.bodyScrollWidth).toBeLessThanOrEqual(400);

    const nativeOptions = await this.flowContext.shell().nativeSidePanelOptions(tabId);
    expect(nativeOptions).toMatchObject({
      ok: true,
      path: `sidepanel.html?target=active&tabId=${tabId}`,
      enabled: true
    });
  }

  async expectLongPageArticleReadBeforeStreamingAnswer(): Promise<void> {
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
    const finalSnapshot = await sidePanel.snapshot(snapshot.runId);

    await cockpit.expectLongPageArticleRead();
    await cockpit.expectStreamingMergedResponse('BrowserHelm streaming 已合并到回复。 长页面正文已读取。');
    await cockpit.expectNoLegacyObserveStatusCard();
    await cockpit.expectNoObserveStatusCards();
    expect((finalSnapshot.trace ?? []).some((event) =>
      event.type === 'tool_started' &&
      payloadRecord(event.payload).tool === TOOL_NAMES.PAGE_READ_ARTICLE
    )).toBe(true);
    expect((finalSnapshot.trace ?? []).some((event) =>
      event.type === 'model_stream_delta'
    )).toBe(true);
  }

  async expectElementInspectHighlightsPageRef(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('offscreen-elements.html');
    await fixture.page.evaluate(() => window.scrollTo(0, 0));

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '观察当前页面',
      mode: 'ask'
    });
    const sidePanelPage = await sidePanel.openRun(snapshot.runId);
    const cockpit = new CockpitPanel(sidePanelPage);

    await cockpit.expectObservedPage({
      title: '离屏元素 - 示例网站',
      url: `${this.flowContext.origin}/offscreen-elements.html`
    });
    await expect.poll(async () => fixture.page.evaluate(() => window.scrollY)).toBeLessThan(10);

    await cockpit.inspectElement('远处按钮');

    await expect.poll(async () => fixture.page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await expect(fixture.page.getByRole('button', { name: '远处按钮' })).toHaveClass(
      /bh-page-ref-highlight/u
    );
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
      tool: 'bh_iframe_click',
      args: {
        refId: `frame_${deleteRef.frameId}:${deleteRef.innerRefId}`
      }
    });

    const approvalPage = await sidePanel.openRun(snapshot.runId);
    await new CockpitPanel(approvalPage).expectApprovalDrawer({
      action: 'bh_iframe_click'
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

  async expectFormDoctorDiagnosis(): Promise<void> {
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

    await new CockpitPanel(page).expectAgentDiagnosis({
      modeText: '用户显式选择 form mode',
      reportTitle: 'Form Doctor 诊断报告',
      finding: '字段校验失败'
    });
  }

  async expectPageInspectorDiagnosis(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('console-network-errors.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    await sidePanel.runOnTab({
      tabId,
      task: '观察当前页面',
      mode: 'ask'
    });
    const enableSnapshot = await sidePanel.runOnTab({
      tabId,
      task: '启用页面健康诊断',
      mode: 'debug'
    });
    await executeToolResult(sidePanel.executeTool({
      runId: enableSnapshot.runId,
      tool: TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
      args: {}
    }));
    await fixture.page.evaluate(() => {
      console.error('Payment widget failed to initialize');
    });
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '检查这个页面有什么错误',
      mode: 'debug'
    });
    const page = await sidePanel.openRun(snapshot.runId);

    await new CockpitPanel(page).expectAgentDiagnosis({
      modeText: '用户显式选择 debug mode',
      reportTitle: 'Page Inspector 诊断报告',
      finding: 'Console error'
    });
  }

  async expectAssistedFormFillSubmitAndDebug(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('form-fill-success.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '填写并提交本地表单：姓名 Counter User，邮箱 counter@example.com，国家 us，同意条款 true',
      mode: 'form'
    });
    const observeResult = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.PAGE_OBSERVE,
      args: {}
    }));
    expect(observeResult.ok).toBe(true);
    const observedSnapshot = await sidePanel.snapshot(snapshot.runId);
    const fields = observedSnapshot.structuredPageData?.forms.items ?? [];
    const fillTargets = [
      { fieldRefId: requireField(fields, 'name').refId, value: 'Counter User' },
      { fieldRefId: requireField(fields, 'email').refId, value: 'counter@example.com' },
      { fieldRefId: requireField(fields, 'country').refId, value: 'us' },
      { fieldRefId: requireField(fields, 'agree').refId, value: 'true' }
    ];
    const submitTargetRefId = fields.find((field) => field.submit?.refId)?.submit?.refId ??
      observedSnapshot.refs?.find((ref) => ref.role === 'button' && ref.name === 'Submit')?.refId;

    const fillResult = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: { fields: fillTargets }
    }));
    expect(fillResult).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: true
    });

    const verifyResult = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.FORM_VERIFY,
      args: {
        fieldRefIds: fillTargets.map((field) => field.fieldRefId),
        ...(submitTargetRefId ? { submitRefId: submitTargetRefId } : {})
      }
    }));
    if (!isRecord(verifyResult.data) || verifyResult.data.status !== 'pass' || verifyResult.data.submitAvailable !== true) {
      throw new Error(`Expected form verification to pass: ${JSON.stringify(verifyResult.data)}`);
    }

    await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
      args: buildSubmitApprovalArgs({
        formName: 'Form Fill Success',
        submitTargetRefId,
        verifyStatus: 'pass',
        verifyFailed: false,
        fields,
        fillTargets
      })
    }));

    const approvalSnapshot = await sidePanel.snapshot(snapshot.runId);
    expect(approvalSnapshot.status).toBe('waiting_for_approval');
    expect(approvalSnapshot.pendingApproval).toBeDefined();

    const approvalPage = await sidePanel.openRun(snapshot.runId);
    await expect(approvalPage.getByLabel('Approval')).toBeVisible();
    await expect(approvalPage.getByText('Form Fill Success', { exact: true })).toBeVisible();
    await expect(approvalPage.getByLabel('Approval').getByText('******').first()).toBeVisible();
    await expect(approvalPage.getByLabel('Approval').getByText('Counter User')).toHaveCount(0);
    await approvalPage.getByRole('button', { name: /显示字段值|Show field values/u }).click();
    await expect(approvalPage.getByLabel('Approval').getByText('Counter User')).toBeVisible();
    await approvalPage.getByRole('button', { name: /隐藏字段值|Hide field values/u }).click();
    await expect(approvalPage.getByLabel('Approval').getByText('Counter User')).toHaveCount(0);

    await approvalPage.getByRole('button', { name: /^(高级开发者选项|Advanced debug options)$/u }).click();
    await approvalPage.getByRole('button', { name: /^(表单执行|Form Execution)$/u }).click();
    await expect(approvalPage.getByText('field_fill_started').first()).toBeVisible();
    await expect(approvalPage.getByText('form_verify_result')).toBeVisible();
    await expect(approvalPage.getByText('submit_approval_requested')).toBeVisible();
    await approvalPage.getByRole('button', { name: /^(关闭|Close)$/u }).click();

    await approvalPage.getByRole('button', { name: 'Approve' }).click();
    await expect(approvalPage.getByText(/Form submit executed after approval/u).first()).toBeVisible();
    const finalSnapshot = await waitForObservedSnapshot(sidePanel, snapshot.runId);
    expect(finalSnapshot.toolResult).toMatchObject({
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
      ok: true,
      code: 'OK'
    });
    const toolTraceJson = JSON.stringify((finalSnapshot.trace ?? []).filter((event) => event.type !== 'run_started'));
    expect(toolTraceJson).not.toContain('Counter User');
    expect(toolTraceJson).not.toContain('counter@example.com');
    expect((finalSnapshot.trace ?? []).map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'field_fill_started',
        'field_fill_result',
        'form_verify_result',
        'submit_approval_requested',
        'form_submit_result'
      ])
    );
  }

  async expectAssistedFormVerifyFailureStillSubmit(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('form-fill-test.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '填写本地测试表单并检查提交审批：姓名 Counter User，邮箱 counter@example.com，国家 us，同意条款 true',
      mode: 'form'
    });
    const observeResult = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.PAGE_OBSERVE,
      args: {}
    }));
    expect(observeResult.ok).toBe(true);
    const observedSnapshot = await sidePanel.snapshot(snapshot.runId);
    const fields = observedSnapshot.structuredPageData?.forms.items ?? [];
    const fillTargets = [
      { fieldRefId: requireField(fields, 'name').refId, value: 'Counter User' },
      { fieldRefId: requireField(fields, 'email').refId, value: 'counter@example.com' },
      { fieldRefId: requireField(fields, 'country').refId, value: 'us' },
      { fieldRefId: requireField(fields, 'agree').refId, value: 'true' }
    ];
    const submitTargetRefId = fields.find((field) => field.submit?.refId)?.submit?.refId ??
      observedSnapshot.refs?.find((ref) => ref.role === 'button' && ref.name === 'Submit')?.refId;

    await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: { fields: fillTargets }
    }));
    const verifyResult = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.FORM_VERIFY,
      args: {
        fieldRefIds: fillTargets.map((field) => field.fieldRefId),
        ...(submitTargetRefId ? { submitRefId: submitTargetRefId } : {})
      }
    }));
    expect(verifyResult.data).toMatchObject({
      status: 'fail',
      submitAvailable: false
    });

    await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
      args: buildSubmitApprovalArgs({
        formName: 'Form Fill Test',
        submitTargetRefId,
        verifyStatus: 'fail',
        verifyFailed: true,
        fields,
        fillTargets,
        skippedCount: 1,
        extraFields: [{
          fieldRefId: requireField(fields, 'password').refId,
          label: 'Password',
          name: 'password',
          type: 'password',
          valuePreview: '******',
          isSensitive: true,
          skipped: true
        }],
        warnings: ['password 字段因敏感策略未自动填写']
      })
    }));

    const approvalPage = await sidePanel.openRun(snapshot.runId);
    await expect(approvalPage.getByLabel('Approval')).toBeVisible();
    await expect(approvalPage.getByText(/Verification failed, still submitting/u)).toBeVisible();
    await expect(approvalPage.getByText('password 字段因敏感策略未自动填写')).toBeVisible();
    await approvalPage.getByRole('button', { name: 'Approve' }).click();
    await expect(approvalPage.getByText(/Form submit executed after approval/u).first()).toBeVisible();

    const finalSnapshot = await waitForObservedSnapshot(sidePanel, snapshot.runId);
    expect((finalSnapshot.trace ?? []).map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'submit_approval_requested',
        'form_submit_result'
      ])
    );
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}

function requireField(fields: FormFieldSnapshot[], name: string): FormFieldSnapshot {
  const field = fields.find((item) => item.name === name);
  if (!field) {
    throw new Error(`Expected form field: ${name}`);
  }
  return field;
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

function buildSubmitApprovalArgs(input: {
  formName: string;
  submitTargetRefId?: string | undefined;
  verifyStatus: 'pass' | 'fail' | 'warn';
  verifyFailed: boolean;
  fields: FormFieldSnapshot[];
  fillTargets: Array<{ fieldRefId: string; value: string }>;
  skippedCount?: number | undefined;
  extraFields?: Array<Record<string, unknown>> | undefined;
  warnings?: string[] | undefined;
}): Record<string, unknown> {
  return {
    formName: input.formName,
    submitMethod: input.submitTargetRefId ? 'button-click' : 'enter-submit',
    ...(input.submitTargetRefId ? { submitTargetRefId: input.submitTargetRefId } : {}),
    verifyStatus: input.verifyStatus,
    verifyFailed: input.verifyFailed,
    fieldCount: input.fillTargets.length + (input.extraFields?.length ?? 0),
    filledCount: input.fillTargets.length,
    skippedCount: input.skippedCount ?? 0,
    riskExplanation: 'E2E submit approval before real submit',
    fields: [
      ...input.fillTargets.map((target) => {
        const field = input.fields.find((candidate) => candidate.refId === target.fieldRefId);
        return {
          fieldRefId: target.fieldRefId,
          label: field?.label ?? field?.name ?? target.fieldRefId,
          name: field?.name,
          type: field?.type ?? 'text',
          valuePreview: target.value === 'true' ? 'checked' : target.value,
          isSensitive: Boolean(field?.sensitive)
        };
      }),
      ...(input.extraFields ?? [])
    ],
    warnings: input.warnings ?? []
  };
}

async function waitForObservedSnapshot(
  sidePanel: ReturnType<E2EFlowContext['sidePanel']>,
  runId: string
): Promise<RunSnapshot> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const snapshot = await sidePanel.snapshot(runId);
    if (!['created', 'observing', 'thinking', 'executing_tool', 'waiting_for_approval'].includes(snapshot.status)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return await sidePanel.snapshot(runId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {};
}
