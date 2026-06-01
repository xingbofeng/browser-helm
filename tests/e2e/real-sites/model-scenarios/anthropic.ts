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
    '严格按 3 次工具调用完成，不要增加额外读取步骤：',
    '第一步调用一次且只调用一次 bh_page_read_article，参数使用 {"maxChars":20000,"includeHeadings":true}；即使结果提示 truncated 或 hasMore，也不要继续读取下一页正文。',
    '第二步直接调用 bh_viewport_scroll 向下滚动一页。不要请求 act mode；滚动视口工具在当前模式可用。',
    '第三步滚动后调用一次 bh_page_read_visible_text 读取当前内容，不要使用 cursor 继续分页。',
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
