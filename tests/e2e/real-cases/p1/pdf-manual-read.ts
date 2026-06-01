import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const pdfManualReadScenario: RealModelScenario = {
  id: 'pdf-manual-read-dialogue',
  title: '通过真实模型读取 PDF 页码范围并总结文档内容',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/basic-form.html`,
  mode: 'full',
  runKind: 'answer',
  dumpName: 'pdf-manual-read',
  task: ({ fixtureOrigin }) => [
    '这是一个文档读取任务。当前页面只是工作台，请读取同源 PDF，不要读取本地文件。',
    `只调用一次 bh_doc_read_url，参数必须拆开写：url = ${fixtureOrigin}/manual.pdf；pageStart = 1；pageEnd = 1；maxChars = 1200。`,
    '工具返回后不要重复读取，即使文本很短也要根据已返回内容完成。',
    '最后用中文总结 PDF 标题/主题，并说明这是通过 bh_doc_read_url 读取的浏览器可访问 PDF。',
    '不要填写当前页面表单、不要下载文件。'
  ].join('\n'),
  async assert({ snapshot }, helpers) {
    helpers.expectToolResult(snapshot, TOOL_NAMES.DOC_READ_URL);
    expect(JSON.stringify(snapshot)).toContain('BrowserHelm PDF');
    expect(JSON.stringify(snapshot)).not.toContain('token=secret');
    helpers.expectFinalMessage(snapshot, /BrowserHelm PDF|PDF|文档|scanned|page/i);
  }
};
