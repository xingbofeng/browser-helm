import type { RunMode } from '../../shared/schemas/tool.schema';
import type { Locale } from '../../i18n/types';

export type ToolContext = {
  runId: string;
  stepId: string;
  runMode?: RunMode;
  locale?: Locale;
};
