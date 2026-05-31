import { test } from '@playwright/test';

import { CdpDebugFlow } from '../../flows/cdp-debug-flow';

test('CDP 附加失败时返回可操作的原因', async () => {
  const flow = await CdpDebugFlow.start();
  try {
    await flow.expectAttachFailureIsActionable();
  } finally {
    await flow.close();
  }
});

test('CDP 深度工具会采集网络、详情、性能、控制台和界面信息并断开连接', async () => {
  const flow = await CdpDebugFlow.start();
  try {
    await flow.expectCdpNetworkPerformanceConsoleAndUi();
  } finally {
    await flow.close();
  }
});

test('页面健康钩子默认关闭且只通过调试开关启用', async () => {
  const flow = await CdpDebugFlow.start();
  try {
    await flow.expectPageHealthHookIsDebugOptIn();
  } finally {
    await flow.close();
  }
});
