import { test } from '@playwright/test';

import { RefWorkflowFlow } from '../../flows/ref-workflow-flow';

test('handles stale ref after DOM removal', async () => {
  const flow = await RefWorkflowFlow.start();
  try {
    await flow.expectStaleRefAfterDomRemoval();
  } finally {
    await flow.close();
  }
});
