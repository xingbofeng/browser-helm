import { test } from '@playwright/test';

import { AdvancedClipboardFlow } from '../../flows/advanced-clipboard-flow';

test.describe('高级剪贴板工具', () => {
  test('只在审批后读取和写入剪贴板', async () => {
    const flow = await AdvancedClipboardFlow.start();
    try {
      await flow.expectClipboardReadWriteRequiresApprovalAndUsesOffscreenBridge();
    } finally {
      await flow.close();
    }
  });
});
