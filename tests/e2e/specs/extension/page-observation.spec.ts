import { test } from '@playwright/test';

import { PageObservationFlow } from '../../flows/page-observation-flow';

test('通过内容脚本 RPC 观察基础表单页面', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectBasicFormObservation();
  } finally {
    await flow.close();
  }
});

test('页面没有交互元素时渲染空观察结果', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectEmptyObservation();
  } finally {
    await flow.close();
  }
});

test('通过运行时聚合观察 iframe 内的表单字段', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectIframeFormObservation();
  } finally {
    await flow.close();
  }
});

test('iframe 表单延迟渲染后刷新侧边栏', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectDelayedIframeFormRefresh();
  } finally {
    await flow.close();
  }
});

test('路由 iframe 读取并在变更前阻止高风险点击和输入', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectIframeActModeReadClickType();
  } finally {
    await flow.close();
  }
});

test('公共点击工具可执行 iframe 内普通目标并要求重新观察', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectPublicActionClickMutatesSafeIframeTarget();
  } finally {
    await flow.close();
  }
});

test('通过运行时审批 API 拒绝高风险 iframe 工具', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectRuntimeApprovalDenyForIframeTool();
  } finally {
    await flow.close();
  }
});
