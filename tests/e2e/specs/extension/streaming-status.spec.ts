import { test } from '@playwright/test';

import { StreamingStatusFlow } from '../../flows/streaming-status-flow';

test('长页面读取追踪包含文章读取工具调用', async () => {
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

test('长页面文章读取失败时界面不会静默卡住', async () => {
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

test('用户发送消息后扩展界面自动滚动到底部', async () => {
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
