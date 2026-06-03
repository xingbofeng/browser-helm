import type { ContentRpcClient } from '../../../page/messaging/content-rpc-client';
import type { ModelClient } from '../../../agent/model/model-client';
import type { SettingsStore } from '../../../storage/interfaces/settings-store';
import type { ExecuteToolInput, RuntimeEvent } from '../../../runtime/runtime-messages';
import type { RunMode } from '../../../shared/schemas/tool.schema';
import type { RunSessionPersistence } from './session-persistence';
import type { RuntimeCapabilityProbeResult } from '../capability-probe';
export type { RunRecord } from '../../../agent/loop/types';
export type { ToolPromptContract } from '../../../tools/core/tool-router';

/** Dependencies injected into the runtime facade. */
export type RunManagerDeps = {
  getActiveTabId?: () => Promise<number | undefined>;
  createContentRpcClient?: (tabId: number) => ContentRpcClient;
  settingsStore?: SettingsStore;
  runSessionPersistence?: RunSessionPersistence | undefined;
  probeRuntimeCapabilities?: ((input: { tabId: number }) => Promise<RuntimeCapabilityProbeResult>) | undefined;
  createProviderModelClient?: (settings: {
    baseUrl: string;
    apiKey: string;
    model: string;
  }) => ModelClient;
};

/** Minimal record shape used by trace append helpers. */
export type TraceRecord = {
  trace: RuntimeEvent[];
};

/** Record shape used by provider scheduling helpers. */
export type ProviderRecord = {
  task: string;
  mode: RunMode;
  trace: RuntimeEvent[];
};

/** Pending approval action stored for post-approval execution. */
export type PendingApprovalAction = ExecuteToolInput;
