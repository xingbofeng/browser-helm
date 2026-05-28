import type { BrowserHelmDomainPolicy } from '../../shared/domain-policy';

export type ProviderSettings = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  streamingEnabled?: boolean;
  allowLocalProviderEndpoints?: boolean;
};

export interface SettingsStore {
  getProviderSettings(): Promise<ProviderSettings | undefined>;
  setProviderSettings(settings: ProviderSettings): Promise<void>;
  getDomainPolicy?(): Promise<BrowserHelmDomainPolicy | undefined>;
  setDomainPolicy?(policy: BrowserHelmDomainPolicy): Promise<void>;
}
