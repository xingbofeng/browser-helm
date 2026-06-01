import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const usaGovScenario: RealModelScenario = {
  id: 'usa-gov-search-dialogue',
  title: '通过真实模型完成 USA.gov 搜索框字段读取和低风险填写',
  url: 'https://www.usa.gov/',
  enabledDomains: ['usa.gov'],
  mode: 'form',
  runKind: 'form_assist',
  dumpName: 'usa-gov-search-fill',
  task: [
    '请完成一次政府网站搜索入口验证，重点是字段读取和不提交。',
    '第一步必须调用 bh_form_read_fields 确认 USA.gov 页面上的站内搜索框，不能只依赖初始页面观察。',
    '然后把该搜索框填写为「passport renewal appointment」。如果字段已有内容，允许清空后覆盖。',
    '填写后用一句中文说明没有提交搜索。',
    '不要提交表单、不要按 Enter、不要点击搜索按钮。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_READ_FIELDS);
    helpers.expectFormFill(snapshot);
    await helpers.expectSearchValue(page.locator('input[type="search"]:visible, input[name*="query"]:visible'), 'passport renewal appointment');
  }
};
