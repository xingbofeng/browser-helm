import { test } from '@playwright/test';

import { CockpitUiFlow } from '../../flows/cockpit-ui-flow';

test('根据自动观察渲染 Agent 瀑布流', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectCockpitAutoObservation();
  } finally {
    await flow.close();
  }
});

test('流式回答前先读取被截断的长页面', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectLongPageArticleReadBeforeStreamingAnswer();
  } finally {
    await flow.close();
  }
});

test('从合并的元素和表单调试标签高亮页面元素', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectElementInspectHighlightsPageRef();
  } finally {
    await flow.close();
  }
});

test('为待处理的运行时请求渲染审批抽屉', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectApprovalDrawerFromPendingRuntimeRequest();
  } finally {
    await flow.close();
  }
});

test('在设置中遮蔽服务商 API 密钥', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectSettingsMaskProviderKey();
  } finally {
    await flow.close();
  }
});

test('从真实运行时快照渲染 Form Doctor 诊断', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectFormDoctorDiagnosis();
  } finally {
    await flow.close();
  }
});

test('从真实运行时快照渲染 Page Inspector 诊断', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectPageInspectorDiagnosis();
  } finally {
    await flow.close();
  }
});

test('填写、校验、审批、提交并调试本地表单', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectAssistedFormFillSubmitAndDebug();
  } finally {
    await flow.close();
  }
});

test('校验失败后的提交仍保持高风险审批保护', async () => {
  const flow = await CockpitUiFlow.start();
  try {
    await flow.expectAssistedFormVerifyFailureStillSubmit();
  } finally {
    await flow.close();
  }
});
