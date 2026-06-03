import { test } from '@playwright/test';

import { PageObservationFlow } from '../../../flows/page-observation-flow';

test('安全回归：提示注入文本只能作为观察数据保留', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectPromptInjectionRemainsObservationData();
  } finally {
    await flow.close();
  }
});

test('安全回归：页面注入文本不能触发点击填写或提交', async () => {
  const flow = await PageObservationFlow.start();
  try {
    await flow.expectPromptInjectionDoesNotExecutePageSuggestedMutations();
  } finally {
    await flow.close();
  }
});
