import type { ZodType } from 'zod';

import type { ToolMode } from '../../shared/schemas/tool.schema';
import type { ToolRisk, ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolContext } from './tool-context';
import type { TranslationKey } from '../../i18n/types';

export type ToolSpec<TArgs, TResult = unknown> = {
  name: string;
  title: string;
  description: string;
  modes: ToolMode[];
  risk: ToolRisk;
  argsSchema: ZodType<TArgs>;
  resultSchema: ZodType<TResult>;
  execute(args: TArgs, ctx: ToolContext): Promise<ToolResult>;
  ui?: {
    titleKey?: TranslationKey;
    descriptionKey?: TranslationKey;
  };
  /** Whether the tool is read-only (does not mutate page state). Default false. */
  readOnly?: boolean;
  /** Whether the tool always requires user approval before execution. Default: derived from risk. */
  requiresApproval?: boolean;
  /** What should happen after the user approves this approval-gated tool. */
  approvalBehavior?: 'record_only' | 'execute_pending_action' | 'custom_flow';
  /** How tool results should be presented in the model context. Default 'summary'. */
  contextVisibility?: 'summary' | 'hidden' | 'full';
};
