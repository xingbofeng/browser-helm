import { test } from '@playwright/test';

import { PageObservationFlow } from '../../flows/page-observation-flow';

test('把提示注入文本保留为观察数据', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectPromptInjectionRemainsObservationData();
  } finally {
    await flow.close();
  }
});
