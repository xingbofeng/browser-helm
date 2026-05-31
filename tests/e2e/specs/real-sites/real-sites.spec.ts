import { test } from '@playwright/test';

import { RealSitesFlow } from '../../flows/real-sites-flow';

test.describe('真实站点冒烟端到端', () => {
  test.skip(
    process.env.BROWSER_HELM_REAL_SITE_E2E !== '1',
    '真实站点端到端用例默认关闭，因为第三方页面不稳定。'
  );

  test('填写 Google 搜索框但不提交', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectGoogleSearchFill();
    } finally {
      await flow.close();
    }
  });

  test('填写 GitHub 搜索框但不提交', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectGithubSearchFill();
    } finally {
      await flow.close();
    }
  });

  test('填写 Apple 注册页低风险字段且不输入敏感数据也不提交', async () => {
    test.setTimeout(120_000);
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectAppleRegistrationLowRiskFill();
    } finally {
      await flow.close();
    }
  });

  test('观察 Anthropic tools-for-agents 文章', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectAnthropicToolsForAgentsArticleObservation();
    } finally {
      await flow.close();
    }
  });
});
