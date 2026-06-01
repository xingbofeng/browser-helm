import { test } from '@playwright/test';

import { DomainAdapterFlow } from '../../flows/domain-adapter-flow';

test('站点 adapter 会在真实扩展运行时检测、展示并提供失败回退', async () => {
  const flow = await DomainAdapterFlow.start();
  try {
    await flow.expectGitHubAdapterDetectionStatusAndFallback();
  } finally {
    await flow.close();
  }
});
