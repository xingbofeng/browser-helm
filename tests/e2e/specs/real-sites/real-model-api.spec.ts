import { test } from '@playwright/test';

import {
  readDotEnvFile
} from '../../../../src/agent/model/provider-config';
import { resolveRealModelProviderConfig } from '../../flows/real-model-provider-config';
import { RealModelScenarioRunner } from '../../flows/real-model-scenario-runner';
import {
  preflightRealModelProvider,
  type RealModelProviderPreflightResult
} from '../../flows/real-model-provider-preflight';
import { realModelScenarios } from '../../real-cases';

const dotEnvText = [
  readDotEnvFile('.env'),
  readDotEnvFile('.env.development')
].filter(Boolean).join('\n');
const providerConfig = resolveRealModelProviderConfig(process.env, dotEnvText);
let providerPreflight: RealModelProviderPreflightResult | undefined;

test.describe('真实站点真实模型 API 端到端', () => {
  test.describe.configure({ mode: 'default' });

  test.skip(
    process.env.BROWSER_HELM_REAL_MODEL_E2E !== '1',
    '真实模型 API 用例默认关闭，避免普通测试误用额度。'
  );
  test.skip(
    providerConfig === undefined,
    '需要配置 OPENAI_BASE_URL、OPENAI_API_KEY 和 OPENAI_MODEL。'
  );

  test.beforeAll(async () => {
    if (process.env.BROWSER_HELM_REAL_MODEL_E2E === '1' && providerConfig) {
      providerPreflight = await preflightRealModelProvider(providerConfig);
    }
  });

  for (const scenario of realModelScenarios) {
    test(scenario.title, async () => {
      test.setTimeout(scenario.id.includes('apple') ? 360_000 : 300_000);
      if (!providerConfig) {
        throw new Error('Missing real model provider config');
      }
      test.skip(
        providerPreflight?.ok === false,
        providerPreflight?.ok === false
          ? `${providerPreflight.reason}: ${providerPreflight.message}`
          : 'Real model provider preflight did not complete.'
      );
      const runner = await RealModelScenarioRunner.start();
      try {
        await runner.run(scenario, {
          ...providerConfig,
          streamingEnabled: true
        });
      } finally {
        await runner.close();
      }
    });
  }
});
