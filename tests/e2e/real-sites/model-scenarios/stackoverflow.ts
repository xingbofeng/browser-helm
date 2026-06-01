import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const stackOverflowScenario: RealModelScenario = {
  id: 'stackoverflow-search-or-block-dialogue',
  title: '通过真实模型观察 Stack Overflow，页面可用时读取字段并填写搜索框',
  url: 'https://stackoverflow.com/questions',
  enabledDomains: ['stackoverflow.com'],
  mode: 'form',
  runKind: 'form_assist',
  dumpName: 'stackoverflow-search-fill',
  task: [
    '这是一段带分支的真实站点任务。请先理解当前 Stack Overflow questions 页面状态。',
    '如果页面不是 Cloudflare 或 Just a moment 拦截，第一步必须调用 bh_form_read_fields 查找搜索框，不能只依赖初始页面观察。',
    '如果搜索框可用，请填写「playwright extension debugging」；如果页面被 Cloudflare 或 Just a moment 拦截，请使用页面可见文本读取工具读取当前状态并用中文总结阻塞信息。',
    '如果字段已有内容，允许清空后覆盖；这不是提交或高风险操作。',
    '当搜索框可用时，填写必须通过 bh_form_fill_field 或 bh_form_fill_many 完成；没有调用填写工具就不能说已经填写。',
    '不要提交表单、不要按 Enter、不要点击搜索按钮。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(helpers.sameOriginAndPath(page.url(), beforeUrl)).toBe(true);
    const field = page.locator('input[name="q"]').first();
    const fieldVisible = await field.isVisible().catch(() => false);
    if (!fieldVisible) {
      helpers.expectTool(snapshot, TOOL_NAMES.PAGE_READ_VISIBLE_TEXT);
      helpers.expectFinalMessage(snapshot, /stack overflow|questions|cloudflare|just a moment|checking/i);
      return;
    }
    helpers.expectTool(snapshot, TOOL_NAMES.FORM_READ_FIELDS);
    helpers.expectFormFill(snapshot);
    await helpers.expectSearchValue(field, 'playwright extension debugging');
  }
};
