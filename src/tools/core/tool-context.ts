import type { RunMode } from '../../shared/schemas/tool.schema';
import type { Locale } from '../../i18n/types';
import type { VisionClientLike } from '../../agent/model/vision-client';
import type { RunSnapshot, TrustedToolExecutionSource } from '../../runtime/runtime-messages';

export type ToolContext = {
  runId: string;
  stepId: string;
  tabId?: number | undefined;
  runMode?: RunMode;
  locale?: Locale;
  source?: TrustedToolExecutionSource | undefined;
  userTask?: string | undefined;
  snapshot?: RunSnapshot | undefined;
  visionClient?: VisionClientLike | undefined;
};
