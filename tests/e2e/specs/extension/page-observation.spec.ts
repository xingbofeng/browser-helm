import { test } from '@playwright/test';

import { PageObservationFlow } from '../../flows/page-observation-flow';

test('observes basic form page through content RPC', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectBasicFormObservation();
  } finally {
    await flow.close();
  }
});

test('renders empty observation for pages without interactive elements', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectEmptyObservation();
  } finally {
    await flow.close();
  }
});
