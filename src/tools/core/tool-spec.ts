import type { ZodType } from 'zod';

import type { ToolMode } from '../../shared/schemas/tool.schema';
import type { ToolRisk, ToolResult } from '../../shared/schemas/toolResult.schema';
import type { ToolContext } from './tool-context';

export type ToolSpec<TArgs, TResult> = {
  name: string;
  title: string;
  description: string;
  modes: ToolMode[];
  risk: ToolRisk;
  argsSchema: ZodType<TArgs>;
  resultSchema: ZodType<TResult>;
  execute(args: TArgs, ctx: ToolContext): Promise<ToolResult>;
};
