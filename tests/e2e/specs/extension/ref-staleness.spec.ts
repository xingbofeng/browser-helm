import { test } from '@playwright/test';

import { RefWorkflowFlow } from '../../flows/ref-workflow-flow';

test('DOM 移除后能处理过期 ref', async () => {
  const flow = await RefWorkflowFlow.start();
  try {
    await flow.expectStaleRefAfterDomRemoval();
  } finally {
    await flow.close();
  }
});
