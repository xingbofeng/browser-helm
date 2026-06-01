import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const mdnScenario: RealModelScenario = {
  id: 'mdn-accessibility-long-read-dialogue',
  title: '通过真实模型读取 MDN Accessibility 文档、滚动复读并总结',
  url: 'https://developer.mozilla.org/en-US/docs/Web/Accessibility',
  mode: 'ask',
  runKind: 'answer',
  dumpName: 'mdn-accessibility-summary',
  task: [
    '请像技术文档助理一样完成一次长文阅读，不要只根据首屏回答。',
    '第一步使用页面正文读取工具读取当前 MDN Accessibility 文档，提取文档主旨和读者对象。',
    '第二步直接调用 bh_viewport_scroll 向下滚动一页。不要请求 act mode；滚动视口工具在当前模式可用。',
    '第三步滚动后使用页面可见文本读取工具读取当前内容。',
    '最后用中文总结这篇文档讲了什么、适合谁阅读、滚动后看到的补充线索。',
    '不要点击链接、不要填写表单。'
  ].join('\n'),
  async assert({ snapshot }, helpers) {
    helpers.expectToolResult(snapshot, TOOL_NAMES.PAGE_READ_ARTICLE);
    helpers.expectTool(snapshot, TOOL_NAMES.VIEWPORT_SCROLL);
    helpers.expectTool(snapshot, TOOL_NAMES.PAGE_READ_VISIBLE_TEXT);
    helpers.expectFinalMessage(snapshot, /accessibility|无障碍|MDN|Web|辅助/i);
  }
};
