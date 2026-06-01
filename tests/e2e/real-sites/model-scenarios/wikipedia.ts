import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const wikipediaScenario: RealModelScenario = {
  id: 'wikipedia-long-read-scroll-dialogue',
  title: '通过真实模型读取 Wikipedia 长文章、滚动、复读并总结',
  url: 'https://en.wikipedia.org/wiki/Web_accessibility',
  mode: 'ask',
  runKind: 'answer',
  dumpName: 'wikipedia-article-read-scroll',
  task: [
    '我们要做一次长页面阅读验证。请像研究助理一样分步骤完成，不要只看初始摘要。',
    '第一步使用页面正文读取工具读取 Wikipedia Web accessibility 页面正文，并提取 3 个关键主题。',
    '第二步直接调用 bh_viewport_scroll 向下滚动一页。不要请求 act mode；滚动视口工具在当前模式可用。',
    '第三步滚动后必须调用 bh_page_read_visible_text 读取当前视口附近内容；不要再次调用 bh_page_read_article。',
    '即使正文读取结果提示 truncated，也必须基于已返回的正文摘要和可见文本继续完成，不要 ask_user，不要请求继续阅读 cursor。',
    '最后用中文给出 3 条要点：页面主题、滚动后新增看到的内容、这页对真实用户的意义。',
    '不要点击链接、不要填写表单、不要提交。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectToolResult(snapshot, TOOL_NAMES.PAGE_READ_ARTICLE);
    helpers.expectTool(snapshot, TOOL_NAMES.VIEWPORT_SCROLL);
    helpers.expectTool(snapshot, TOOL_NAMES.PAGE_READ_VISIBLE_TEXT);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    helpers.expectFinalMessage(snapshot, /无障碍|accessibility|网页|用户|滚动/i);
  }
};
