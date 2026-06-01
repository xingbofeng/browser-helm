import { test } from '@playwright/test';

import {
  readDotEnvFile,
  type ProviderConfig,
  resolveProviderConfigWithDotEnvFallback
} from '../../../../src/agent/model/provider-config';
import { RealModelScenarioRunner } from '../../flows/real-model-scenario-runner';
import { realModelScenarios } from '../../real-sites/model-scenarios';

const dotEnvText = [
  readDotEnvFile('.env'),
  readDotEnvFile('.env.development')
].filter(Boolean).join('\n');
const providerConfig = resolveRealModelProviderConfig(process.env, dotEnvText);

test.describe('真实站点真实模型 API 端到端', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(
    process.env.BROWSER_HELM_REAL_MODEL_E2E !== '1',
    '真实模型 API 用例默认关闭，避免普通测试误用额度。'
  );
  test.skip(
    providerConfig === undefined,
    '需要配置 OPENAI_BASE_URL、OPENAI_API_KEY 和 OPENAI_MODEL。'
  );

  for (const scenario of realModelScenarios) {
    test(scenario.title, async () => {
      test.setTimeout(scenario.id.includes('apple') ? 360_000 : 300_000);
      if (!providerConfig) {
        throw new Error('Missing real model provider config');
      }
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

function resolveRealModelProviderConfig(
  env: NodeJS.ProcessEnv,
  dotEnvText: string
): ProviderConfig | undefined {
  const dedicated = {
    baseUrl: env.BROWSER_HELM_REAL_MODEL_BASE_URL?.trim() || dotEnvValue(dotEnvText, 'BROWSER_HELM_REAL_MODEL_BASE_URL'),
    apiKey: env.BROWSER_HELM_REAL_MODEL_API_KEY?.trim() || dotEnvValue(dotEnvText, 'BROWSER_HELM_REAL_MODEL_API_KEY'),
    model: env.BROWSER_HELM_REAL_MODEL?.trim() || dotEnvValue(dotEnvText, 'BROWSER_HELM_REAL_MODEL')
  };
  if (dedicated.baseUrl && dedicated.apiKey && dedicated.model) {
    return dedicated;
  }
  return resolveProviderConfigWithDotEnvFallback(env, dotEnvText);
}

function dotEnvValue(text: string, key: string): string {
  const line = text
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${key}=`) || item.startsWith(`export ${key}=`));
  if (!line) {
    return '';
  }
  const rawValue = line.slice(line.indexOf('=') + 1).trim();
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }
  return rawValue;
}
