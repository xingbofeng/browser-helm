import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const googleScenario: RealModelScenario = {
  id: 'google-search-dialogue',
  title: '通过真实模型完成 Google 搜索框识别、字段读取和低风险填写',
  url: 'https://www.google.com/',
  enabledDomains: ['google.com'],
  mode: 'form',
  runKind: 'form_assist',
  dumpName: 'google-search-fill',
  task: [
    '我们做一次像真实用户排障一样的长任务。你现在在 Google 首页，先不要急着填写。',
    '第一步必须调用 bh_form_read_fields 读取页面里的可写字段，不能只依赖初始页面观察。',
    '然后根据字段 label、name、role 或可写状态判断哪个字段是搜索框。',
    '把搜索框填写为「美国 无障碍」。如果字段已有内容，允许清空后覆盖；这不是提交或高风险操作，不需要再向用户确认。',
    '填写后用一句中文说明你识别搜索框的依据，并明确说明没有提交搜索。',
    '禁止提交表单、禁止按 Enter、禁止点击搜索按钮。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_READ_FIELDS);
    helpers.expectFormFill(snapshot);
    await helpers.expectSearchValue(page.locator('textarea[name="q"], input[name="q"]'), '美国 无障碍');
  }
};
