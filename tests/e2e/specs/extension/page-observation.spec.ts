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

test('observes form fields inside iframe through runtime aggregation', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectIframeFormObservation();
  } finally {
    await flow.close();
  }
});

test('refreshes side panel after delayed iframe form render', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectDelayedIframeFormRefresh();
  } finally {
    await flow.close();
  }
});

test.skip('routes iframe read and blocks high-risk click/type before mutation', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectIframeActModeReadClickType();
  } finally {
    await flow.close();
  }
});

test.skip('denies high-risk iframe tool through runtime approval API', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectRuntimeApprovalDenyForIframeTool();
  } finally {
    await flow.close();
  }
});
