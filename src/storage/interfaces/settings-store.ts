export type ProviderSettings = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  streamingEnabled?: boolean;
};

export interface SettingsStore {
  getProviderSettings(): Promise<ProviderSettings | undefined>;
  setProviderSettings(settings: ProviderSettings): Promise<void>;
}
