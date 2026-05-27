import type { ContentRpcClient } from '../../../page/messaging/content-rpc-client';
import type { ModelClient } from '../../../agent/model/model-client';
import type { SettingsStore } from '../../../storage/interfaces/settings-store';
import type { ExecuteToolInput, RuntimeEvent } from '../../../runtime/runtime-messages';
import type { RunMode } from '../../../shared/schemas/tool.schema';

/** Internal record tracking per-run state within the runtime. */
export type RunRecord = {
  task: string;
  mode: RunMode;
  tabId?: number | undefined;
  trace: RuntimeEvent[];
  skipProviderResponse?: boolean | undefined;
};

/** Dependencies injected into the runtime facade. */
export type RunManagerDeps = {
  getActiveTabId?: () => Promise<number | undefined>;
  createContentRpcClient?: (tabId: number) => ContentRpcClient;
  settingsStore?: SettingsStore;
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
