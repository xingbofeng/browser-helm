import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const storageStateReadScenario: RealModelScenario = {
  id: 'storage-state-read-dialogue',
  title: '通过真实模型读取 Web Storage 状态并保持敏感值脱敏',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/basic-form.html`,
  mode: 'full',
  runKind: 'answer',
  dumpName: 'storage-state-read',
  beforeRun: async (page) => {
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('authToken', 'secret-token-value');
      sessionStorage.setItem('wizardStep', 'shipping');
    });
  },
  task: [
    '这是一个 Advanced storage 场景。必须调用 bh_storage_list 读取 localStorage，limit=10。',
    '然后调用 bh_storage_get 读取 sessionStorage 的 wizardStep。',
    '用中文总结可见的 storage key、普通值预览和敏感值 masking 情况。',
    '不要输出 authToken 的原始值，不要写入、删除或清空 storage。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectToolResult(snapshot, TOOL_NAMES.STORAGE_LIST);
    helpers.expectToolResult(snapshot, TOOL_NAMES.STORAGE_GET);
    expect(JSON.stringify(snapshot)).toContain('theme');
    expect(JSON.stringify(snapshot)).toContain('wizardStep');
    expect(JSON.stringify(snapshot)).toContain('shipping');
    expect(JSON.stringify(snapshot)).not.toContain('secret-token-value');
    helpers.expectFinalMessage(snapshot, /storage|localStorage|sessionStorage|wizardStep|脱敏|masked/i);
  }
};
