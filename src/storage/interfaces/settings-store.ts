import type { BrowserHelmDomainPolicy } from '../../shared/domain-policy';
import type { AdapterId } from '../../adapters/adapter-types';
import type { DomainAdapterSettings } from '../../adapters/preferences';

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
  getDomainAdapterSettings?(): Promise<DomainAdapterSettings | undefined>;
  setDomainAdapterEnabled?(adapterId: AdapterId, enabled: boolean): Promise<DomainAdapterSettings>;
}
