import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const amazonScenario: RealModelScenario = {
  id: 'amazon-homepage-state-dialogue',
  title: '通过真实模型读取 Amazon 首页、滚动复读并总结搜索入口状态',
  url: 'https://www.amazon.com/',
  mode: 'ask',
  runKind: 'answer',
  dumpName: 'amazon-search-entry-summary',
  task: [
    '我们要像真实用户一样判断 Amazon 首页当前是否可用，而不是只读标题。',
    '第一步使用页面可见文本读取工具读取当前 Amazon 首页。',
    '第二步直接调用 bh_viewport_scroll 向下滚动一页。不要请求 act mode；滚动视口工具在当前模式可用。',
    '第三步滚动后即使工具提示已到边界或页面被限制，也必须再次调用页面可见文本读取工具读取当前页面内容。',
    '最后用中文总结当前页面状态，并分别说明是否看到了搜索入口、商品或导航内容、站点限制信息。',
    '不要填写表单、不要提交、不要点击。'
  ].join('\n'),
  async assert({ snapshot }, helpers) {
    helpers.expectTool(snapshot, TOOL_NAMES.VIEWPORT_SCROLL);
    helpers.expectToolCountAtLeast(snapshot, TOOL_NAMES.PAGE_READ_VISIBLE_TEXT, 2);
    helpers.expectFinalMessage(snapshot, /amazon|搜索|Search|首页|验证码|地区|限制|入口/i);
  }
};
