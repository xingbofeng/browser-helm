import { test } from '@playwright/test';

import { ErrorStateFlow } from '../../flows/error-state-flow';

test('把内容脚本不可用处理为扩展边界错误', async () => {
  const flow = await ErrorStateFlow.start();
  try {
    await flow.expectContentUnavailableError();
  } finally {
    await flow.close();
  }
});
