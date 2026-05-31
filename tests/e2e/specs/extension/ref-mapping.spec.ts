import { test } from '@playwright/test';

import { RefWorkflowFlow } from '../../flows/ref-workflow-flow';

test('从无障碍快照渲染 ref 映射', async () => {
  const flow = await RefWorkflowFlow.start();
  try {
    await flow.expectInteractiveElementsRefMapping();
  } finally {
    await flow.close();
  }
});
