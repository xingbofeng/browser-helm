import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const redditScenario: RealModelScenario = {
  id: 'reddit-feed-block-or-content-dialogue',
  title: '通过真实模型读取 Reddit feed、滚动、复读并总结页面状态',
  url: 'https://www.reddit.com/r/webdev/',
  mode: 'ask',
  runKind: 'answer',
  dumpName: 'reddit-feed-summary',
  beforeRun: async (page, helpers) => {
    await helpers.waitForBodyText(page, /reddit|blocked|verification|webdev|please wait/i);
  },
  task: [
    '我们要验证真实动态 feed 的读取能力，即使站点返回阻塞页也要完成完整流程。',
    '第一步使用页面可见文本读取工具读取当前 Reddit webdev feed 的内容。',
    '第二步直接调用 bh_viewport_scroll 向下滚动一页。不要请求 act mode；滚动视口工具在当前模式可用。',
    '第三步滚动后即使工具提示已到边界或页面被阻塞，也必须再次调用页面可见文本读取工具读取当前页面内容。',
    '最后用中文总结当前页面状态、滚动前后能看到的帖子线索或阻塞信息。',
    '不要登录、不要点击、不要填写表单。'
  ].join('\n'),
  async assert({ snapshot }, helpers) {
    helpers.expectTool(snapshot, TOOL_NAMES.VIEWPORT_SCROLL);
    helpers.expectToolCountAtLeast(snapshot, TOOL_NAMES.PAGE_READ_VISIBLE_TEXT, 2);
    helpers.expectFinalMessage(snapshot, /reddit|webdev|帖子|登录|阻塞|页面|verification/i);
  }
};
