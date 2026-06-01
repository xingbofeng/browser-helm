import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const githubAdapterGuidanceScenario: RealModelScenario = {
  id: 'github-adapter-guidance-dialogue',
  title: '通过真实模型检测 GitHub adapter、列出 workflow 并匹配 locator hint',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/basic-form.html`,
  mode: 'ask',
  runKind: 'answer',
  dumpName: 'github-adapter-guidance',
  task: [
    '这是一个 v1.6 Domain Adapter 只读验证。当前页面不是 GitHub，但用户给了目标 URL。',
    '第一步调用 bh_adapter_detect_site，url 使用 https://github.com/openai/browser-helm/issues。',
    '第二步调用 bh_adapter_list_workflows，读取 GitHub adapter 的 workflow templates，并说明 adapter workflow 不能绕过 approval。',
    '第三步调用 bh_adapter_apply_locator，url 仍然使用 https://github.com/openai/browser-helm/issues，locatorId 使用 github-issues-tab，candidates 里给一个可匹配候选：refId=ref_issues，label=Issues，selector=a[data-tab-item="issues-tab"]。',
    '最后用中文总结：是否检测到 GitHub adapter、有哪些 workflow/guidance、locator hint 如何帮助匹配 Issues tab，以及 adapter workflow 仍然需要 approval。',
    '不要打开 GitHub，不要点击页面，不要创建 issue。'
  ].join('\n'),
  async assert({ snapshot }, helpers) {
    helpers.expectToolResult(snapshot, TOOL_NAMES.ADAPTER_DETECT_SITE);
    helpers.expectToolResult(snapshot, TOOL_NAMES.ADAPTER_LIST_WORKFLOWS);
    helpers.expectToolResult(snapshot, TOOL_NAMES.ADAPTER_APPLY_LOCATOR);
    helpers.expectFinalMessage(snapshot, /GitHub adapter|workflow|approval|Issues|locator/i);
  }
};
