import { test } from '@playwright/test';

import { PageObservationFlow } from '../../flows/page-observation-flow';

test('keeps prompt injection text as observation data', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectPromptInjectionRemainsObservationData();
  } finally {
    await flow.close();
  }
});
