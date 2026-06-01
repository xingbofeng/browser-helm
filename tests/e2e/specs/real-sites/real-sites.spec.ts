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

  test('读取 Wikipedia 长文章并滚动页面', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectWikipediaArticleReadAndScroll();
    } finally {
      await flow.close();
    }
  });

  test('填写 YouTube 搜索框但不提交', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectYouTubeSearchBoxFill();
    } finally {
      await flow.close();
    }
  });

  test('观察 Reddit feed 的可交互元素', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectRedditFeedObservation();
    } finally {
      await flow.close();
    }
  });

  test('观察 Amazon 搜索入口，页面可用时填写搜索框但不提交', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectAmazonSearchObservationOrFill();
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

  test('观察 Stack Overflow questions，页面可用时填写搜索框但不提交', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectStackOverflowQuestionsObservationOrSearchFill();
    } finally {
      await flow.close();
    }
  });

  test('读取 MDN Accessibility 文档', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectMdnArticleObservation();
    } finally {
      await flow.close();
    }
  });

  test('观察 BBC News 首页', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectBbcNewsObservation();
    } finally {
      await flow.close();
    }
  });

  test('填写 USA.gov 搜索框但不提交', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectUsaGovSearchFill();
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
