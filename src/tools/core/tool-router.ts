import { z, ZodError } from 'zod';

import type { ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolMode } from '../../shared/schemas/tool.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { ToolRisk } from '../../shared/schemas/tool-result.schema';
import type { ToolContext } from './tool-context';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import {
  TOOL_ARGS_INVALID,
  TOOL_EXECUTION_FAILED,
  TOOL_MODE_NOT_ALLOWED,
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
  /** Whether the tool is read-only (does not mutate page state). */
  readOnly: boolean;
  /** Whether the tool always requires user approval before execution. */
  requiresApproval: boolean;
  /** What should happen after the user approves this approval-gated tool. */
  approvalBehavior?: 'record_only' | 'execute_pending_action' | 'custom_flow' | undefined;
  /** How tool results should be presented in the model context. */
  contextVisibility: 'summary' | 'hidden' | 'full';
};

const ACT_MODE_SHARED_TOOL_NAMES = new Set<string>([TOOL_NAMES.PAGE_OBSERVE]);

export class ToolRouter {
  constructor(private readonly registry: ToolRegistry) {}

  listToolNames(): string[] {
    return this.registry.list().map((tool) => tool.name);
  }

  listToolContracts(runMode?: RunMode): ToolPromptContract[] {
    return this.registry.list().filter((tool) =>
      runMode ? isToolAvailableInRunMode(tool.modes, runMode, tool.name) : true
    ).map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      modes: tool.modes,
      risk: tool.risk,
      argsSchema: z.toJSONSchema(tool.argsSchema),
      readOnly: tool.readOnly ?? false,
      requiresApproval: tool.requiresApproval ?? (tool.risk === 'high'),
      approvalBehavior: tool.approvalBehavior,
      contextVisibility: tool.contextVisibility ?? 'summary'
    }));
  }

  getToolContract(name: string, runMode?: RunMode): ToolPromptContract | undefined {
    return this.listToolContracts(runMode).find((tool) => tool.name === name);
  }

  async execute(input: ToolCallInput, ctx: ToolContext): Promise<ToolResult> {
    const spec = this.registry.get(input.tool);
    if (!spec) {
      return failedToolResult(TOOL_NOT_FOUND, `Tool not found: ${input.tool}`);
    }

    if (ctx.runMode && !isToolAvailableInRunMode(spec.modes, ctx.runMode, spec.name)) {
      return failedToolResult(
        TOOL_MODE_NOT_ALLOWED,
        `Tool ${input.tool} is not available in ${ctx.runMode} mode`,
        false
      );
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

export function isToolAvailableInRunMode(
  toolModes: ToolMode[],
  runMode: RunMode,
  toolName?: string
): boolean {
  if (toolModes.includes('internal')) {
    return true;
  }
  if (toolModes.includes('memory')) {
    return true;
  }
  if (runMode === 'ask') {
    return toolModes.includes('ask');
  }
  if (runMode === 'debug') {
    return toolModes.includes('ask') || toolModes.includes('debug');
  }
  if (runMode === 'form') {
    return toolModes.includes('ask') || toolModes.includes('form');
  }
  if (runMode === 'full') {
    return true;
  }
  return (
    toolModes.includes('act') ||
    toolModes.includes('form') ||
    (toolName !== undefined && ACT_MODE_SHARED_TOOL_NAMES.has(toolName))
  );
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
