import { test } from '@playwright/test';

import { StreamingStatusFlow } from '../../flows/streaming-status-flow';

test('长页面读取 trace 包含 article read 工具调用', async () => {
  const flow = await StreamingStatusFlow.start();
  try {
    await flow.expectLongPageReadArticleInTrace();
  } finally {
    await flow.close();
  }
});

test('首次发送长页面总结会直接流式吐字并完成回复', async () => {
  const flow = await StreamingStatusFlow.start();
  try {
    await flow.expectFirstAskStreamsAnswerWithoutSecondSubmit();
  } finally {
    await flow.close();
  }
});

test('长页面 article read 失败时 UI 不静默卡住', async () => {
  const flow = await StreamingStatusFlow.start();
  try {
    await flow.expectLongPageArticleReadFailureShowsError();
  } finally {
    await flow.close();
  }
});

test('AI 完成后不残留错误的运行中目标状态', async () => {
  const flow = await StreamingStatusFlow.start();
  try {
    await flow.expectNoResidualRunningStatusAfterFinish();
  } finally {
    await flow.close();
  }
});

test('用户发送消息后 extension 自动滚动到底部', async () => {
  const flow = await StreamingStatusFlow.start();
  try {
    await flow.expectAutoScrollToBottomAfterSend();
  } finally {
    await flow.close();
  }
});

test('多轮对话带历史上下文', async () => {
  const flow = await StreamingStatusFlow.start();
  try {
    await flow.expectMultiTurnConversationKeepsContext();
  } finally {
    await flow.close();
  }
});
