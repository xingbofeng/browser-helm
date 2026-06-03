import { test } from '@playwright/test';

import { PageObservationFlow } from '../../flows/page-observation-flow';

test('把提示注入文本保留为观察数据', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectPromptInjectionRemainsObservationData();
  } finally {
    await flow.close();
  }
});

test('页面注入文本不能触发点击填写或提交', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectPromptInjectionDoesNotExecutePageSuggestedMutations();
  } finally {
    await flow.close();
  }
});
