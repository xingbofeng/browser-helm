import type { RuntimeCapabilities } from '../../shared/schemas/runtime-capabilities.schema';
import type { ToolSelection } from '../../shared/schemas/mode-system.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { ToolRisk } from '../../shared/schemas/tool-result.schema';
import type { ToolPromptContract } from './tool-router';
import { isToolAvailableInRunMode } from './tool-router';

type SelectToolsInput = {
  mode: RunMode;
  task: string;
  tools: ToolPromptContract[];
  capabilities: RuntimeCapabilities;
  permissions?: {
    allowedRisks?: ToolRisk[];
    allowedDomains?: string[];
  };
  pendingApproval?: boolean;
  pageDomain?: string;
  lastError?: {
    code: string;
  };
  pageState?: {
    hasForm?: boolean;
  };
};

export function selectToolsForRun(input: SelectToolsInput): ToolSelection {
  const visibleTools: string[] = [];
  const hiddenTools: ToolSelection['hiddenTools'] = [];
  const limitations: string[] = [];

  for (const tool of input.tools) {
    if (input.pendingApproval && tool.risk !== 'safe') {
      hiddenTools.push({
        tool: tool.name,
        reason: 'A pending approval is active; mutating or risky tools are paused'
      });
      continue;
    }

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

    if (!isToolAvailableInRunMode(tool.modes, input.mode, tool.name)) {
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

    if (input.permissions?.allowedRisks && !input.permissions.allowedRisks.includes(tool.risk)) {
      hiddenTools.push({
        tool: tool.name,
        reason: `Tool risk ${tool.risk} is not allowed by current policy`
      });
      continue;
    }

    if (
      input.pageDomain &&
      input.permissions?.allowedDomains &&
      input.permissions.allowedDomains.length > 0 &&
      !input.permissions.allowedDomains.includes(input.pageDomain)
    ) {
      hiddenTools.push({
        tool: tool.name,
        reason: `Domain ${input.pageDomain} is not allowed by current policy`
      });
      if (!limitations.includes(`Domain ${input.pageDomain} is not allowed`)) {
        limitations.push(`Domain ${input.pageDomain} is not allowed`);
      }
      continue;
    }

    if (tool.name.startsWith('bh_form_') && input.pageState?.hasForm === false) {
      hiddenTools.push({
        tool: tool.name,
        reason: 'No form is detected in current page state'
      });
      if (!limitations.includes('No form detected on page')) {
        limitations.push('No form detected on page');
      }
      continue;
    }

    if (tool.name.startsWith('bh_debug_') && !input.capabilities.shallowDebugAvailable) {
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
