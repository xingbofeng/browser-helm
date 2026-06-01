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
  task: [
    '把这次任务当成一次搜索入口验证，而不是简单输入。',
    '第一步必须调用 bh_form_read_fields 读取 YouTube 当前页面字段，不能只依赖初始页面观察。',
    '确认哪个字段是可写搜索框；如果页面显示同意、登录或不可用状态，请只根据可用字段继续，不要点击任何按钮。',
    '如果搜索框可写，把它填写为「keyboard accessibility tutorial」。如果字段已有内容，允许清空后覆盖。',
    '填写后用一句中文说明没有提交搜索。',
    '不要提交表单、不要按 Enter、不要点击搜索按钮。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_READ_FIELDS);
    helpers.expectFormFill(snapshot);
    await helpers.expectSearchValue(page.locator('input[name="search_query"]'), 'keyboard accessibility tutorial');
  }
};
