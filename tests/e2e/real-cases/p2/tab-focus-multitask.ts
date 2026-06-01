import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const tabFocusMultitaskScenario: RealModelScenario = {
  id: 'tab-context-selection-dialogue',
  title: '通过真实模型列出多个 tab、确认 active tab 并从标题中选出目标 tab',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/long-page.html`,
  mode: 'full',
  runKind: 'answer',
  dumpName: 'tab-focus-multitask',
  beforeRun: async (page) => {
    const shadowPage = await page.context().newPage();
    await shadowPage.goto(`${new URL(page.url()).origin}/shadow-dom.html`);
    const downloadsPage = await page.context().newPage();
    await downloadsPage.goto(`${new URL(page.url()).origin}/downloads.html`);
    await page.bringToFront();
  },
  task: [
    '这是一个多 tab 工作流验证。浏览器里已经有长页面、Shadow DOM Fixture、Download Fixture 三个 tab。',
    '第一步调用 bh_tab_get_active，确认当前 active tab。',
    '第二步调用 bh_tab_list，列出所有 tab，并根据 title 找到 Shadow DOM Fixture 对应的 tabId。',
    '第三步不要切换 tab，只根据 bh_tab_list 的结果用中文总结 active tab、Shadow DOM Fixture 的 tabId/title/url、Download Fixture 是否也存在。',
    '不要调用 bh_tab_focus，不要关闭 tab、不要点击页面内容。'
  ].join('\n'),
  async assert({ snapshot }, helpers) {
    helpers.expectTool(snapshot, TOOL_NAMES.TAB_GET_ACTIVE);
    helpers.expectToolResult(snapshot, TOOL_NAMES.TAB_LIST);
    helpers.expectNoTool(snapshot, TOOL_NAMES.TAB_FOCUS);
    helpers.expectFinalMessage(snapshot, /Shadow DOM Fixture|Download Fixture|tabId|active|tab/i);
  }
};
