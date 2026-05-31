import { test } from '@playwright/test';

import { AdvancedShadowFlow } from '../../flows/advanced-shadow-flow';

test('高级影子 DOM 工具会读取真实开放的影子根', async () => {
  const flow = await AdvancedShadowFlow.start();
  try {
    await flow.expectShadowToolsReadRealOpenShadowRoot();
  } finally {
    await flow.close();
  }
});
