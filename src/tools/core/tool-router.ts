import { z, ZodError } from 'zod';

import type { ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolMode } from '../../shared/schemas/tool.schema';
import type { ToolRisk } from '../../shared/schemas/tool-result.schema';
import type { ToolContext } from './tool-context';
import {
  TOOL_ARGS_INVALID,
  TOOL_EXECUTION_FAILED,
  TOOL_NOT_FOUND,
  TOOL_RESULT_INVALID
} from './tool-errors';
import { failedToolResult } from './tool-result-factory';
import type { ToolRegistry } from './tool-registry';

export type ToolCallInput = {
  tool: string;
  args: unknown;
};

export type ToolPromptContract = {
  name: string;
  title: string;
  description: string;
  modes: ToolMode[];
  risk: ToolRisk;
  argsSchema: unknown;
};

export class ToolRouter {
  constructor(private readonly registry: ToolRegistry) {}

  listToolNames(): string[] {
    return this.registry.list().map((tool) => tool.name);
  }

  listToolContracts(): ToolPromptContract[] {
    return this.registry.list().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      modes: tool.modes,
      risk: tool.risk,
      argsSchema: z.toJSONSchema(tool.argsSchema)
    }));
  }

  getToolContract(name: string): ToolPromptContract | undefined {
    return this.listToolContracts().find((tool) => tool.name === name);
  }

  async execute(input: ToolCallInput, ctx: ToolContext): Promise<ToolResult> {
    const spec = this.registry.get(input.tool);
    if (!spec) {
      return failedToolResult(TOOL_NOT_FOUND, `Tool not found: ${input.tool}`);
    }

    const argsResult = spec.argsSchema.safeParse(input.args);
    if (!argsResult.success) {
      return failedToolResult(
        TOOL_ARGS_INVALID,
        `Tool args invalid for ${input.tool}`,
        false
      );
    }

    try {
      const result = await spec.execute(argsResult.data, ctx);
      const schemaResult = spec.resultSchema.safeParse(result);
      if (!schemaResult.success) {
        return failedToolResult(
          TOOL_RESULT_INVALID,
          `Tool result invalid for ${input.tool}`,
          false
        );
      }
      return result;
    } catch (error) {
      return failedToolResult(
        TOOL_EXECUTION_FAILED,
        `Tool execution failed for ${input.tool}: ${normalizeError(error)}`,
        true
      );
    }
  }
}

function normalizeError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join('; ');
  }
  return 'Unknown error';
}
