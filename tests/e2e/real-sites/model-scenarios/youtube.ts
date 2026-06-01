import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const youtubeScenario: RealModelScenario = {
  id: 'youtube-search-dialogue',
  title: '通过真实模型完成 YouTube 搜索框字段读取和低风险填写',
  url: 'https://www.youtube.com/',
  enabledDomains: ['youtube.com'],
  mode: 'form',
  runKind: 'form_assist',
  dumpName: 'youtube-search-fill',
  beforeRun: async (page) => {
    const searchBox = page.locator('input[name="search_query"]').first();
    await searchBox.waitFor({ state: 'visible', timeout: 30_000 });
    await searchBox.click();
    await page.waitForTimeout(1_500);
  },
  task: [
    '目标：验证 YouTube 搜索入口，只填写，不提交。',
    '精确搜索词：keyboard accessibility tutorial',
    '步骤 1：必须调用 bh_form_read_fields 读取当前字段。',
    '步骤 2：选择可写搜索框，立刻调用 bh_form_fill_field 或 bh_form_fill_many 写入上面的精确搜索词；如已有内容可 clear 后覆盖。',
    '不要调用 a11y resolve，不要提交表单、按 Enter 或点击搜索按钮。',
    '完成后用一句中文说明已填写且没有提交。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_READ_FIELDS);
    helpers.expectFormFill(snapshot);
    await helpers.expectSearchValue(page.locator('input[name="search_query"]'), 'keyboard accessibility tutorial');
  }
};
