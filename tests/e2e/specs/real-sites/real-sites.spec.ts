import { test } from '@playwright/test';

import { RealSitesFlow } from '../../flows/real-sites-flow';

test.describe('real site smoke E2E', () => {
  test.skip(
    process.env.BROWSER_HELM_REAL_SITE_E2E !== '1',
    'Real site E2E is opt-in because third-party pages are unstable.'
  );

  test('fills Google search box without submitting', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectGoogleSearchFill();
    } finally {
      await flow.close();
    }
  });

  test('fills GitHub search box without submitting', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectGithubSearchFill();
    } finally {
      await flow.close();
    }
  });

  test('fills Apple registration low-risk fields without sensitive data or submit', async () => {
    test.setTimeout(120_000);
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectAppleRegistrationLowRiskFill();
    } finally {
      await flow.close();
    }
  });

  test('observes Anthropic tools-for-agents article', async () => {
    const flow = await RealSitesFlow.start();
    try {
      await flow.expectAnthropicToolsForAgentsArticleObservation();
    } finally {
      await flow.close();
    }
  });
});
