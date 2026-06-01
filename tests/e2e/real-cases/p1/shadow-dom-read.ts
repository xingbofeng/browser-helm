import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const shadowDomReadScenario: RealModelScenario = {
  id: 'shadow-dom-read-dialogue',
  title: '通过真实模型发现 open Shadow DOM 并读取内部输入框和按钮',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/shadow-dom.html`,
  mode: 'full',
  runKind: 'answer',
  dumpName: 'shadow-dom-read',
  task: [
    '这是一个 Advanced Browser Tools 场景。页面有 Web Component，普通可见文本可能看不到 shadow root 里的控件。',
    '第一步调用 bh_shadow_list 找到 open shadow root，并确认 host selector。',
    '第二步只用 bh_shadow_query 查询 #search-widget 内的 button, input，并读取工具结果里的 name/role/text。',
    '第三步必须直接 finish：用中文总结 shadow root 内有哪些控件、它们的 name/role/text 是什么、为什么这里只读不点击不输入。',
    '这个任务没有第四步、第五步，也没有提交动作；不要调用 bh_a11y_*、bh_action_*、bh_pointer_*、bh_tab_*。',
    '禁止填写搜索框、禁止点击 Go，禁止继续寻找不存在的提交按钮。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectToolResult(snapshot, TOOL_NAMES.SHADOW_LIST);
    helpers.expectToolResult(snapshot, TOOL_NAMES.SHADOW_QUERY);
    const value = await page.locator('x-search').evaluate((host) =>
      (host.shadowRoot?.querySelector('input') as HTMLInputElement | null)?.value ?? ''
    );
    expect(value).toBe('');
    helpers.expectFinalMessage(snapshot, /Shadow DOM|shadow root|Search docs|Run search|只读/i);
  }
};
