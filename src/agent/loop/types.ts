import type { RuntimeEvent, RuntimeTaskState, RunKind } from '../../runtime/runtime-messages';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { Locale } from '../../i18n/types';
import type { AgentMessageRole } from '../../shared/schemas/agent-message.schema';

/** Internal record tracking per-run state within the agent loop/runtime boundary. */
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
