import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

type ProviderEnv = {
  OPENAI_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

const PROVIDER_ENV_KEYS = [
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL'
] as const;

type ProviderEnvKey = (typeof PROVIDER_ENV_KEYS)[number];

export function resolveProviderConfigFromEnv(
  env: ProviderEnv = process.env
): ProviderConfig | undefined {
  const baseUrl = env.OPENAI_BASE_URL?.trim() ?? '';
  const apiKey = env.OPENAI_API_KEY?.trim() ?? '';
  const model = env.OPENAI_MODEL?.trim() ?? '';

  if (!baseUrl || !apiKey || !model) {
    return undefined;
  }

  return {
    baseUrl,
    apiKey,
    model
  };
}

export function parseDotEnvText(text: string): ProviderEnv {
  const parsed: ProviderEnv = {};
  const lines = text.split(/\r?\n/u);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const content = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line;
    const equalsIndex = content.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = content.slice(0, equalsIndex).trim();
    if (!isProviderEnvKey(key)) {
      continue;
    }

    const rawValue = content.slice(equalsIndex + 1).trim();
    parsed[key] = unquote(rawValue);
  }

  return parsed;
}

export function resolveProviderConfigWithDotEnvFallback(
  env: ProviderEnv = process.env,
  dotEnvText = ''
): ProviderConfig | undefined {
  const fallback = parseDotEnvText(dotEnvText);
  const mergedEnv: ProviderEnv = {};
  const baseUrl = env.OPENAI_BASE_URL?.trim() || fallback.OPENAI_BASE_URL;
  const apiKey = env.OPENAI_API_KEY?.trim() || fallback.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL?.trim() || fallback.OPENAI_MODEL;

  if (baseUrl) {
    mergedEnv.OPENAI_BASE_URL = baseUrl;
  }
  if (apiKey) {
    mergedEnv.OPENAI_API_KEY = apiKey;
  }
  if (model) {
    mergedEnv.OPENAI_MODEL = model;
  }

  return resolveProviderConfigFromEnv(mergedEnv);
}

export function readDotEnvFile(dotEnvPath = '.env'): string {
  const absolutePath = resolvePath(dotEnvPath);
  if (!existsSync(absolutePath)) {
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function isProviderEnvKey(value: string): value is ProviderEnvKey {
  return PROVIDER_ENV_KEYS.includes(value as ProviderEnvKey);
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
