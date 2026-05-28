import type { ContentRpcClient } from '../../../page/messaging/content-rpc-client';
import type { ModelClient } from '../../../agent/model/model-client';
import type { SettingsStore } from '../../../storage/interfaces/settings-store';
import type { ExecuteToolInput, RuntimeEvent, RuntimeTaskState } from '../../../runtime/runtime-messages';
import type { RunKind } from '../../../runtime/runtime-messages';
import type { RunMode } from '../../../shared/schemas/tool.schema';
import type { Locale } from '../../../i18n/types';
import type { AgentMessageRole } from '../../../shared/schemas/agent-message.schema';

/** Internal record tracking per-run state within the runtime. */
export type RunRecord = {
  task: string;
  mode: RunMode;
  tabId?: number | undefined;
  trace: RuntimeEvent[];
  runKind?: RunKind;
  locale?: Locale;
  taskState?: RuntimeTaskState | undefined;
  conversationHistory?: Array<{
    role: AgentMessageRole;
    title?: string | undefined;
    content: string;
  }> | undefined;
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

/** Contract describing a tool available to the model prompt. */
export type ToolPromptContract = {
  name: string;
  title: string;
  description: string;
  modes: string[];
  risk: string;
  argsSchema: unknown;
};
