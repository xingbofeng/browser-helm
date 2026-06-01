import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from './types';

export const anthropicScenario: RealModelScenario = {
  id: 'anthropic-tools-for-agents-long-read-dialogue',
  title: '通过真实模型读取 Anthropic Agent 工具文章、滚动复读并总结建议',
  url: 'https://www.anthropic.com/engineering/writing-tools-for-agents',
  mode: 'ask',
  runKind: 'answer',
  dumpName: 'anthropic-tools-for-agents-summary',
  task: [
    '请像 Agent 工具设计 reviewer 一样阅读这篇文章，目标是提炼可执行建议。',
    '第一步使用页面正文读取工具读取当前 Anthropic writing tools for agents 文章，提取工具设计建议。',
    '第二步直接调用 bh_viewport_scroll 向下滚动一页。不要请求 act mode；滚动视口工具在当前模式可用。',
    '第三步滚动后使用页面可见文本读取工具读取当前内容。',
    '最后用中文总结文章对 Agent 工具设计的核心建议，并指出滚动后新增看到的一条细节。',
    '不要点击链接、不要填写表单。'
  ].join('\n'),
  async assert({ snapshot }, helpers) {
    helpers.expectToolResult(snapshot, TOOL_NAMES.PAGE_READ_ARTICLE);
    helpers.expectTool(snapshot, TOOL_NAMES.VIEWPORT_SCROLL);
    helpers.expectTool(snapshot, TOOL_NAMES.PAGE_READ_VISIBLE_TEXT);
    helpers.expectFinalMessage(snapshot, /工具|agents|Agent|Anthropic|设计|上下文/i);
  }
};
