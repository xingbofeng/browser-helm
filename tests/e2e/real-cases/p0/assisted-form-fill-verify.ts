import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const assistedFormFillVerifyScenario: RealModelScenario = {
  id: 'assisted-form-fill-verify-dialogue',
  title: '通过真实模型完成低敏注册表单填写、verify 复查且不提交',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/form-fill-success.html`,
  enabledDomains: ['127.0.0.1'],
  mode: 'form',
  runKind: 'form_assist',
  dumpName: 'assisted-form-fill-verify',
  beforeRun: async (page) => {
    await page.locator('#email').fill('browserhelm@example.com');
  },
  task: [
    '我们验证 Assisted Form Fill 的真实闭环：先读字段、再填低敏信息、最后复查，不要提交。',
    '页面里的 Email 字段已经由用户预先填写；你只需要保留它，不要修改 Email。',
    '第一步必须调用 bh_form_read_fields，找出 Full Name、Email、Country、I agree to the terms 四个字段和 submit 控件。',
    '第二步调用 bh_form_fill_many 只填写这三个低敏字段：Full Name = BrowserHelm Test User；Country = United States；I agree to the terms = true。',
    '第三步必须调用 bh_form_verify，用读取到的全部 fieldRefIds 和 submitRefId 复查表单是否 ready。',
    '最后中文说明已填写哪些字段、verify 是否通过、并明确没有提交表单。',
    '禁止调用 bh_form_submit_with_approval，禁止点击 Submit，禁止按 Enter。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_READ_FIELDS);
    helpers.expectFormFill(snapshot);
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_VERIFY);
    helpers.expectNoTool(snapshot, TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL);
    await expect(page.locator('#name')).toHaveValue('BrowserHelm Test User');
    await expect(page.locator('#email')).toHaveValue('browserhelm@example.com');
    await expect(page.locator('#country')).toHaveValue('us');
    await expect(page.locator('input[name="agree"]')).toBeChecked();
    await expect(page.locator('#success')).toBeHidden();
    helpers.expectFinalMessage(snapshot, /verify|复查|通过|未提交|没有提交/i);
  }
};
