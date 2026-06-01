import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const githubScenario: RealModelScenario = {
  id: 'github-search-dialogue',
  title: '通过真实模型完成 GitHub 搜索页字段读取和查询填写',
  url: 'https://github.com/search',
  enabledDomains: ['github.com'],
  mode: 'form',
  runKind: 'form_assist',
  dumpName: 'github-search-fill',
  task: [
    '请把这次任务当成 GitHub 搜索页的表单理解验证。',
    '第一步必须调用 bh_form_read_fields 确认查询输入框，不能只依赖初始页面观察。',
    '如果页面已有搜索参数，允许覆盖为新的查询；这是低风险字段填写，不需要再次确认。',
    '把搜索框填写为「browser helm extension」。',
    '填写后用一句中文说明你没有提交搜索。',
    '不要提交表单、不要按 Enter、不要点击搜索按钮。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_READ_FIELDS);
    helpers.expectFormFill(snapshot);
    await helpers.expectSearchValue(page.locator('input[name="q"], input[placeholder*="Search"]'), 'browser helm extension');
  }
};
