import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const cdpConsoleNetworkDiagnosisScenario: RealModelScenario = {
  id: 'cdp-console-network-diagnosis-dialogue',
  title: '通过真实模型使用 CDP attach、console、network、performance 并 detach',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/console-network-errors.html`,
  mode: 'debug',
  runKind: 'answer',
  dumpName: 'cdp-console-network-diagnosis',
  beforeRun: async (page) => {
    await page.evaluate(() => {
      window.setInterval(() => {
        console.error('BrowserHelm real CDP scenario payment widget failure sk-1234567890abcdef');
        fetch('/missing-real-model-cdp?token=secret#frag').catch(() => undefined);
      }, 700);
    });
  },
  task: [
    '这是一个 Page Inspector / CDP 深度诊断任务，请按真实排障流程走完。',
    '第一步调用 bh_cdp_attach 连接当前 tab，args 必须是空对象 {}；不要传 tabId，不要猜 tabId，也不要先调用 bh_cdp_get_targets。',
    '第二步等待页面继续产生错误后，调用 bh_cdp_get_console_events 读取 console 错误。',
    '第三步调用 bh_cdp_get_network_events 读取 network 请求/失败摘要，注意 token 或密钥应该被脱敏。',
    '第四步调用 bh_cdp_get_performance_metrics 读取性能指标。',
    '最后必须调用 bh_cdp_detach，args 也必须是空对象 {}；不要为了 detach 调用 bh_cdp_get_targets，不要猜 tabId。detach 后用中文总结 console、network、performance 三类信号和脱敏情况。',
    '不要填写表单、不要点击页面、不要修复页面。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectTool(snapshot, TOOL_NAMES.CDP_ATTACH);
    helpers.expectTool(snapshot, TOOL_NAMES.CDP_GET_CONSOLE_EVENTS);
    helpers.expectTool(snapshot, TOOL_NAMES.CDP_GET_NETWORK_EVENTS);
    helpers.expectTool(snapshot, TOOL_NAMES.CDP_GET_PERFORMANCE_METRICS);
    helpers.expectTool(snapshot, TOOL_NAMES.CDP_DETACH);
    expect(JSON.stringify(snapshot)).not.toContain('sk-1234567890abcdef');
    expect(JSON.stringify(snapshot)).not.toContain('token=secret');
    helpers.expectFinalMessage(snapshot, /console|network|performance|脱敏|CDP/i);
  }
};
