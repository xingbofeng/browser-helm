import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const downloadMetadataReadScenario: RealModelScenario = {
  id: 'download-metadata-read-dialogue',
  title: '通过真实模型列出真实下载记录、总结文件元数据且不读取文件内容',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/downloads.html`,
  mode: 'full',
  runKind: 'answer',
  dumpName: 'download-metadata-read',
  beforeRun: async (page) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-report').click()
    ]);
    await download.path();
  },
  task: [
    '这是一个 Advanced download 场景。用户刚刚在当前页面下载了 report.txt。',
    '第一步调用 bh_download_list，limit=10，读取浏览器下载记录元数据。',
    '然后用中文总结是否找到 report.txt、能看到哪些安全元数据、URL query/hash 是否被脱敏。',
    '不要调用 bh_file_read_download，不要读取文件内容，不要上传文件，不要再次点击下载链接。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectToolResult(snapshot, TOOL_NAMES.DOWNLOAD_LIST);
    helpers.expectNoTool(snapshot, TOOL_NAMES.FILE_READ_DOWNLOAD);
    expect(JSON.stringify(snapshot)).toContain('report.txt');
    expect(JSON.stringify(snapshot)).not.toContain('token=secret');
    helpers.expectFinalMessage(snapshot, /report\.txt|下载|metadata|元数据|脱敏/i);
  }
};
