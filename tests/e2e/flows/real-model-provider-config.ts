import {
  type ProviderConfig,
  resolveProviderConfigWithDotEnvFallback
} from '../../../src/agent/model/provider-config';

export function resolveRealModelProviderConfig(
  env: NodeJS.ProcessEnv,
  dotEnvText: string
): ProviderConfig | undefined {
  const fallback = resolveProviderConfigWithDotEnvFallback(env, dotEnvText);
  const dedicated = {
    baseUrl: env.BROWSER_HELM_REAL_MODEL_BASE_URL?.trim() || dotEnvValue(dotEnvText, 'BROWSER_HELM_REAL_MODEL_BASE_URL'),
    apiKey: env.BROWSER_HELM_REAL_MODEL_API_KEY?.trim() || dotEnvValue(dotEnvText, 'BROWSER_HELM_REAL_MODEL_API_KEY'),
    model: env.BROWSER_HELM_REAL_MODEL?.trim() || dotEnvValue(dotEnvText, 'BROWSER_HELM_REAL_MODEL')
  };
  const baseUrl = dedicated.baseUrl || fallback?.baseUrl;
  const apiKey = dedicated.apiKey || fallback?.apiKey;
  const model = dedicated.model || fallback?.model;
  if (!baseUrl || !apiKey || !model) {
    return undefined;
  }
  return {
    baseUrl,
    apiKey,
    model
  };
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
