import type { RunMode } from '../../shared/schemas/tool.schema';
import type { Locale } from '../../i18n/types';
import type { VisionClientLike } from '../../agent/model/vision-client';

export type ToolContext = {
  runId: string;
  stepId: string;
  tabId?: number | undefined;
  runMode?: RunMode;
  locale?: Locale;
  visionClient?: VisionClientLike | undefined;
};
