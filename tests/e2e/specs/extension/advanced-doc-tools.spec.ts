import { test } from '@playwright/test';

import { AdvancedDocFlow } from '../../flows/advanced-doc-flow';

test('高级文档工具会从真实 PDF 测试文件中提取文本', async () => {
  const flow = await AdvancedDocFlow.start();
  try {
    await flow.expectDocToolReadsPdfFixture();
  } finally {
    await flow.close();
  }
});
