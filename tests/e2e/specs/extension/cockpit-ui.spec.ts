import { test } from '@playwright/test';

import { CockpitUiFlow } from '../../flows/cockpit-ui-flow';

test('renders v1.0.1 agent waterfall from automatic observation', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectCockpitAutoObservation();
  } finally {
    await flow.close();
  }
});

test('renders approval drawer for a pending runtime request', async () => {
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

test('renders v1 Form Doctor diagnosis from real runtime snapshot', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectV1FormDoctorDiagnosis();
  } finally {
    await flow.close();
  }
});

test('renders v1 Page Inspector diagnosis from real runtime snapshot', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectV1PageInspectorDiagnosis();
  } finally {
    await flow.close();
  }
});
