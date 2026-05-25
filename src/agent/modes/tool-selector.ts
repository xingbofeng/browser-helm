import type { RuntimeCapabilities } from '../../shared/schemas/runtime-capabilities.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { ToolSelection } from '../../shared/schemas/mode-system.schema';
import type { ToolPromptContract } from '../../tools/core/tool-router';
import { isToolAvailableInRunMode } from '../../tools/core/tool-router';

type SelectToolsInput = {
  mode: RunMode;
  task: string;
  tools: ToolPromptContract[];
  capabilities: RuntimeCapabilities;
};

export function selectToolsForRun(input: SelectToolsInput): ToolSelection {
  const visibleTools: string[] = [];
  const hiddenTools: ToolSelection['hiddenTools'] = [];
  const limitations: string[] = [];

  for (const tool of input.tools) {
    const modeAllowed = isToolAvailableInRunMode(
      tool.modes,
      input.mode,
      tool.name
    );
    if (!modeAllowed) {
      hiddenTools.push({
        tool: tool.name,
        reason: `Tool is not available in ${input.mode} mode`
      });
      continue;
    }

    if (tool.risk === 'high') {
      hiddenTools.push({
        tool: tool.name,
        reason: 'High-risk tools require explicit approval boundary'
      });
      continue;
    }

    if (isDebugTool(tool) && !input.capabilities.shallowDebugAvailable) {
      hiddenTools.push({
        tool: tool.name,
        reason: 'Shallow debug capability is unavailable'
      });
      if (!limitations.includes('Shallow debug signals are unavailable')) {
        limitations.push('Shallow debug signals are unavailable');
      }
      continue;
    }

    visibleTools.push(tool.name);
  }

  return {
    mode: input.mode,
    visibleTools,
    hiddenTools,
    limitations
  };
}

function isDebugTool(tool: ToolPromptContract): boolean {
  return tool.name.startsWith('bh_debug_');
}
