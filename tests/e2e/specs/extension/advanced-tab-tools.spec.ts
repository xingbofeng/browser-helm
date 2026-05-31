import { test } from '@playwright/test';

import { AdvancedTabFlow } from '../../flows/advanced-tab-flow';

test('高级标签页工具会列出真实标签页并聚焦选中的目标', async () => {
  const flow = await AdvancedTabFlow.start();
  try {
    await flow.expectTabToolsListAndFocusRealTabs();
  } finally {
    await flow.close();
  }
});
