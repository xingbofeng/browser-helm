import { test } from '@playwright/test';

import { DebugDrawerFlow } from '../../flows/debug-drawer-flow';

test('debug drawer Trace tab 显示分级 trace item', async () => {
  const flow = await DebugDrawerFlow.start();
  try {
    await flow.expectTraceTabShowsGradedItems();
  } finally {
    await flow.close();
  }
});

test('trace item 大 payload 默认折叠', async () => {
  const flow = await DebugDrawerFlow.start();
  try {
    await flow.expectLargePayloadCollapsed();
  } finally {
    await flow.close();
  }
});

test('工具结果 tab 显示工具调用结果', async () => {
  const flow = await DebugDrawerFlow.start();
  try {
    await flow.expectToolsTabShowsResults();
  } finally {
    await flow.close();
  }
});

test('无工具时工具 tab 显示空态', async () => {
  const flow = await DebugDrawerFlow.start();
  try {
    await flow.expectToolsTabEmptyState();
  } finally {
    await flow.close();
  }
});

test('错误 trace 有明显 error 状态', async () => {
  const flow = await DebugDrawerFlow.start();
  try {
    await flow.expectErrorTraceHasErrorState();
  } finally {
    await flow.close();
  }
});
