import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const fixtureLongPagePaginationScenario: RealModelScenario = {
  id: 'fixture-long-page-pagination-dialogue',
  title: '通过真实模型读取本地长页面、滚动分页并总结新增内容',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/long-page.html`,
  mode: 'ask',
  runKind: 'answer',
  dumpName: 'fixture-long-page-pagination',
  task: [
    '这是一个稳定 fixture 的长页面读取回归。请不要只看初始观察。',
    '第一步调用 bh_page_read_article 读取正文，maxChars 可以控制在 6000 以内，并保留 headings。',
    '第二步调用 bh_viewport_scroll 向下滚动一页。',
    '第三步调用 bh_page_read_visible_text 读取滚动后的当前视口文本。',
    '最后用中文总结初始主题、滚动后新增看到的 section、页面底部是否出现 BrowserHelm E2E Test Fixture。',
    '不要点击导航链接、不要提交任何内容。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectToolResult(snapshot, TOOL_NAMES.PAGE_READ_ARTICLE);
    helpers.expectTool(snapshot, TOOL_NAMES.VIEWPORT_SCROLL);
    helpers.expectTool(snapshot, TOOL_NAMES.PAGE_READ_VISIBLE_TEXT);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    helpers.expectFinalMessage(snapshot, /长页面|section|段落|BrowserHelm|fixture/i);
  }
};
