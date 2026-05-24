import { test } from '@playwright/test';

import { RefWorkflowFlow } from '../../flows/ref-workflow-flow';

test('renders ref mapping from a11y snapshot', async () => {
  const flow = await RefWorkflowFlow.start();
  try {
    await flow.expectInteractiveElementsRefMapping();
  } finally {
    await flow.close();
  }
});
