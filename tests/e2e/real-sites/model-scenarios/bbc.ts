import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const bbcScenario: RealModelScenario = {
  id: 'bbc-news-homepage-dialogue',
  title: '通过真实模型读取 BBC News 首页、滚动复读并总结导航和内容线索',
  url: 'https://www.bbc.com/news',
  mode: 'ask',
  runKind: 'answer',
  dumpName: 'bbc-news-summary',
  task: [
    '请像新闻首页巡检一样完成这次任务，目标是确认页面状态和内容线索。',
    '第一步使用页面可见文本读取工具读取当前 BBC News 首页。',
    '第二步直接调用 bh_viewport_scroll 向下滚动一页。不要请求 act mode；滚动视口工具在当前模式可用。',
    '第三步滚动后即使工具提示已到边界，也必须再次调用页面可见文本读取工具读取当前页面内容。',
    '最后用中文总结当前新闻首页状态、主要导航、内容线索以及滚动后新增看到的信息。',
    '不要点击链接、不要填写表单。'
  ].join('\n'),
  async assert({ snapshot }, helpers) {
    helpers.expectTool(snapshot, TOOL_NAMES.VIEWPORT_SCROLL);
    helpers.expectToolCountAtLeast(snapshot, TOOL_NAMES.PAGE_READ_VISIBLE_TEXT, 2);
    helpers.expectFinalMessage(snapshot, /BBC|新闻|news|首页|导航/i);
  }
};
