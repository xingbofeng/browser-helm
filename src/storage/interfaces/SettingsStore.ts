export type ProviderSettings = {
  baseUrl: string;
  model: string;
};

export interface SettingsStore {
  getProviderSettings(): Promise<ProviderSettings | undefined>;
  setProviderSettings(settings: ProviderSettings): Promise<void>;
}
