import type { ModelClient } from '../../agent/model/model-client';
import { VisionClient } from '../../agent/model/vision-client';
import type {
  RuntimeProviderTestResult,
  TestProviderSettingsInput
} from '../../runtime/runtime-messages';
import type { SettingsStore } from '../../storage/interfaces/settings-store';
import { createProviderClient } from './provider-client-factory';

export type ProviderServiceDeps = {
  settingsStore: SettingsStore;
  createProviderModelClient?: ((settings: {
    baseUrl: string;
    apiKey: string;
    model: string;
  }) => ModelClient) | undefined;
  createProviderClient?: typeof createProviderClient | undefined;
};

export class ProviderService {
  constructor(private readonly deps: ProviderServiceDeps) {}

  testProviderSettings(input: TestProviderSettingsInput): Promise<RuntimeProviderTestResult> {
    const client = this.createProviderClient({
      baseUrl: input.baseUrl,
      model: input.model,
      apiKey: input.apiKey ?? '',
      ...(input.allowLocalProviderEndpoints === undefined ? {} : { allowLocalProviderEndpoints: input.allowLocalProviderEndpoints })
    });
    return client.testConnection();
  }

  async createVisionClient(): Promise<VisionClient | undefined> {
    const settings = await this.deps.settingsStore.getProviderSettings();
    if (!settings?.apiKey || !settings.model.trim()) {
      return undefined;
    }
    const modelClient = this.deps.createProviderModelClient?.({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model
    }) ?? this.createProviderClient({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      ...(settings.allowLocalProviderEndpoints === undefined ? {} : {
        allowLocalProviderEndpoints: settings.allowLocalProviderEndpoints
      })
    });
    return new VisionClient(modelClient);
  }

  private createProviderClient(input: Parameters<typeof createProviderClient>[0]): ReturnType<typeof createProviderClient> {
    const factory = this.deps.createProviderClient ?? createProviderClient;
    return factory(input);
  }
}
