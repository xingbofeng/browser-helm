import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const formDoctorDisabledSubmitScenario: RealModelScenario = {
  id: 'form-doctor-disabled-submit-dialogue',
  title: '通过真实模型诊断必填缺失、校验状态和 disabled submit 原因',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/disabled-submit.html`,
  mode: 'form',
  runKind: 'answer',
  dumpName: 'form-doctor-disabled-submit',
  task: [
    '这是一段 Form Doctor 真实排障任务。请不要填写、不要提交，只做只读诊断。',
    '第一步必须调用 bh_form_read_fields 读取字段快照，确认页面有哪些 required 字段。',
    '第二步调用 bh_form_find_missing_required，列出当前缺失的必填项。',
    '第三步调用 bh_form_find_disabled_submit_reason，判断提交按钮为什么不可用，并区分 confirmed / inferred / unknown。',
    '最后用中文给出诊断结论：缺少哪些用户动作、submit 当前状态、你是否修改了页面。',
    '禁止调用 bh_form_fill_field、bh_form_fill_many、bh_form_submit_with_approval。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_READ_FIELDS);
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_FIND_MISSING_REQUIRED);
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_FIND_DISABLED_SUBMIT_REASON);
    helpers.expectNoTool(snapshot, TOOL_NAMES.FORM_FILL_FIELD);
    helpers.expectNoTool(snapshot, TOOL_NAMES.FORM_FILL_MANY);
    await expect(page.locator('#name')).toHaveValue('');
    await expect(page.locator('#terms')).not.toBeChecked();
    await expect(page.locator('#submit')).toBeDisabled();
    helpers.expectFinalMessage(snapshot, /姓名|条款|required|必填|disabled|禁用/i);
  }
};
