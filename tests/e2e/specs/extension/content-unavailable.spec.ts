import { test } from '@playwright/test';

import { ErrorStateFlow } from '../../flows/error-state-flow';

test('handles content unavailable as an extension boundary error', async () => {
  const flow = await ErrorStateFlow.start();
  try {
    await flow.expectContentUnavailableError();
  } finally {
    await flow.close();
  }
});
