import { test } from '@playwright/test';

import { DebugDrawerFlow } from '../../flows/debug-drawer-flow';

test('调试抽屉的追踪标签显示分级追踪条目', async () => {
  const flow = await DebugDrawerFlow.start();
  try {
    await flow.expectTraceTabShowsGradedItems();
  } finally {
    await flow.close();
  }
});

test('追踪条目的大负载默认折叠', async () => {
  const flow = await DebugDrawerFlow.start();
  try {
    await flow.expectLargePayloadCollapsed();
  } finally {
    await flow.close();
  }
});

test('工具结果标签显示工具调用结果', async () => {
  const flow = await DebugDrawerFlow.start();
  try {
    await flow.expectToolsTabShowsResults();
  } finally {
    await flow.close();
  }
});

test('无工具时工具标签显示空态', async () => {
  const flow = await DebugDrawerFlow.start();
  try {
    await flow.expectToolsTabEmptyState();
  } finally {
    await flow.close();
  }
});

test('错误追踪有明显错误状态', async () => {
  const flow = await DebugDrawerFlow.start();
  try {
    await flow.expectErrorTraceHasErrorState();
  } finally {
    await flow.close();
  }
});
