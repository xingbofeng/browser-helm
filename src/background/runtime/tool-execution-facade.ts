import type { ExecuteToolInput } from '../../runtime/runtime-messages';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';
import type { SettingsStore } from '../../storage/interfaces/settings-store';

export type ToolExecutionFacadeDeps = {
  settingsStore: SettingsStore;
  refreshDomainPolicy: () => Promise<void>;
  execute: (input: ExecuteToolInput) => Promise<ToolResult>;
};

export class ToolExecutionFacade {
  constructor(private readonly deps: ToolExecutionFacadeDeps) {}

  async execute(input: ExecuteToolInput): Promise<ToolResult> {
    await this.deps.settingsStore.getDomainAdapterSettings?.();
    await this.deps.refreshDomainPolicy();
    return await this.deps.execute(input);
  }
}
