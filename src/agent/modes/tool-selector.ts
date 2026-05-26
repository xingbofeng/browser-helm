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
  pageState?: {
    hasForm?: boolean;
  };
};

export function selectToolsForRun(input: SelectToolsInput): ToolSelection {
  const visibleTools: string[] = [];
  const hiddenTools: ToolSelection['hiddenTools'] = [];
  const limitations: string[] = [];

  for (const tool of input.tools) {
    if (!input.capabilities.hasActiveTab && !tool.modes.includes('internal')) {
      hiddenTools.push({
        tool: tool.name,
        reason: 'No active tab is available'
      });
      if (!limitations.includes('No active tab is available')) {
        limitations.push('No active tab is available');
      }
      continue;
    }

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

    if (isFormTool(tool) && input.pageState?.hasForm === false) {
      hiddenTools.push({
        tool: tool.name,
        reason: 'No form is detected in current page state'
      });
      if (!limitations.includes('No form detected on page')) {
        limitations.push('No form detected on page');
      }
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

function isFormTool(tool: ToolPromptContract): boolean {
  return tool.name.startsWith('bh_form_');
}
