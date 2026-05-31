import { test } from '@playwright/test';

import { AdvancedFileFlow } from '../../flows/advanced-file-flow';

test('高级文件工具会列出真实下载并让本地文件读取和上传保持审批保护', async () => {
  const flow = await AdvancedFileFlow.start();
  try {
    await flow.expectDownloadToolsUseRealDownloadMetadata();
  } finally {
    await flow.close();
  }
});
