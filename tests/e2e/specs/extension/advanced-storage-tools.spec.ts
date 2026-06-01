import { test } from '@playwright/test';

import { AdvancedStorageFlow } from '../../flows/advanced-storage-flow';

test('高级存储工具会读取真实 Web Storage 且不暴露敏感值', async () => {
  const flow = await AdvancedStorageFlow.start();
  try {
    await flow.expectStorageToolsReadRealPageStorageSafely();
  } finally {
    await flow.close();
  }
});

test('高级存储写入必须审批且批准后才修改 Web Storage', async () => {
  const flow = await AdvancedStorageFlow.start();
  try {
    await flow.expectStorageMutationRequiresApprovalAndChangesStorageAfterApproval();
  } finally {
    await flow.close();
  }
});
