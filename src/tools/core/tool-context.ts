import type { RunMode } from '../../shared/schemas/tool.schema';

export type ToolContext = {
  runId: string;
  stepId: string;
  runMode?: RunMode;
};
