import { test } from '@playwright/test';

import { CockpitUiFlow } from '../../flows/cockpit-ui-flow';

test('renders agent waterfall from automatic observation', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectCockpitAutoObservation();
  } finally {
    await flow.close();
  }
});

test('reads truncated long pages before streaming the answer', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectLongPageArticleReadBeforeStreamingAnswer();
  } finally {
    await flow.close();
  }
});

test('highlights page elements from the merged elements and forms debug tab', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectElementInspectHighlightsPageRef();
  } finally {
    await flow.close();
  }
});

test.skip('renders approval drawer for a pending runtime request', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectApprovalDrawerFromPendingRuntimeRequest();
  } finally {
    await flow.close();
  }
});

test('masks provider API key in settings', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectSettingsMaskProviderKey();
  } finally {
    await flow.close();
  }
});

test('renders Form Doctor diagnosis from real runtime snapshot', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectFormDoctorDiagnosis();
  } finally {
    await flow.close();
  }
});

test('renders Page Inspector diagnosis from real runtime snapshot', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectPageInspectorDiagnosis();
  } finally {
    await flow.close();
  }
});

test('fills, verifies, approves, submits, and debugs a local form', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectAssistedFormFillSubmitAndDebug();
  } finally {
    await flow.close();
  }
});

test('keeps verify-failed submit behind high-risk approval', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectAssistedFormVerifyFailureStillSubmit();
  } finally {
    await flow.close();
  }
});
