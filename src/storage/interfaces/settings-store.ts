export type ProviderSettings = {
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export interface SettingsStore {
  getProviderSettings(): Promise<ProviderSettings | undefined>;
  setProviderSettings(settings: ProviderSettings): Promise<void>;
}
