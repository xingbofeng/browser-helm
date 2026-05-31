import { test } from '@playwright/test';

import { ActiveTabRefreshFlow } from '../../flows/active-tab-refresh-flow';

test('同一标签页导航后侧边栏观察卡自动刷新', async () => {
  const flow = await ActiveTabRefreshFlow.start();
  try {
    await flow.expectObservationRefreshesAfterNavigation();
  } finally {
    await flow.close();
  }
});

test('自动观察触发 QA 卡片并有结构化页面数据', async () => {
  const flow = await ActiveTabRefreshFlow.start();
  try {
    await flow.expectObservationTriggersQaCard();
  } finally {
    await flow.close();
  }
});
