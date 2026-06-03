import type { RuntimeCapabilities } from '../../shared/schemas/runtime-capabilities.schema';
import type { ToolSelection } from '../../shared/schemas/mode-system.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { ToolRisk } from '../../shared/schemas/tool-result.schema';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
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
    requireExplicitDomainConsent?: boolean | undefined;
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

    const capabilityGate = evaluateCapabilityGate(tool.name, input.capabilities);
    if (capabilityGate) {
      hiddenTools.push({
        tool: tool.name,
        reason: capabilityGate
      });
      if (
        (capabilityGate.endsWith('capability is unavailable') || capabilityGate === 'Shallow debug signals are unavailable') &&
        !limitations.includes(capabilityGate)
      ) {
        limitations.push(capabilityGate);
      }
      continue;
    }

    if (tool.modes.includes('advanced')) {
      const advancedGate = evaluateAdvancedToolGate(tool.name, input.task, input.capabilities);
      if (advancedGate) {
        hiddenTools.push({
          tool: tool.name,
          reason: advancedGate
        });
        if (advancedGate.endsWith('permission is unavailable') && !limitations.includes(advancedGate)) {
          limitations.push(advancedGate);
        }
        continue;
      }
    }

    if (tool.risk === 'high' && input.mode !== 'full') {
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
      !matchesAllowedDomain(input.pageDomain, input.permissions.allowedDomains)
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

    if (
      input.permissions?.requireExplicitDomainConsent === true &&
      input.pageDomain &&
      !isLocalDevelopmentDomain(input.pageDomain) &&
      toolRequiresExplicitDomainConsent(tool) &&
      !matchesAllowedDomain(input.pageDomain, input.permissions?.allowedDomains)
    ) {
      const reason = `Domain ${input.pageDomain} requires explicit consent before mutating or diagnostic hook tools are exposed`;
      hiddenTools.push({
        tool: tool.name,
        reason
      });
      if (!limitations.includes(`Domain ${input.pageDomain} requires explicit consent`)) {
        limitations.push(`Domain ${input.pageDomain} requires explicit consent`);
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

function evaluateCapabilityGate(
  toolName: string,
  capabilities: RuntimeCapabilities
): string | undefined {
  if (toolName.startsWith('bh_cdp_') && !capabilities.hasDebuggerPermission) {
    return 'Debugger capability is unavailable';
  }
  if (toolName.startsWith('bh_debug_') && !capabilities.shallowDebugAvailable) {
    return 'Shallow debug signals are unavailable';
  }
  if (toolName.startsWith('bh_clipboard_') && !capabilities.hasClipboardPermission) {
    return 'Clipboard capability is unavailable';
  }
  if (
    (
      toolName.startsWith('bh_download_') ||
      (toolName.startsWith('bh_file_') && toolName !== TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL)
    ) &&
    !capabilities.hasDownloadsPermission
  ) {
    return 'Downloads capability is unavailable';
  }
  if (toolName.startsWith('bh_storage_') && capabilities.hasStorageInspection !== true) {
    return 'Storage inspection capability is unavailable';
  }
  return undefined;
}

function evaluateAdvancedToolGate(
  toolName: string,
  task: string,
  _capabilities: RuntimeCapabilities
): string | undefined {
  if (toolName === TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL) {
    return taskNeedsAdvancedFamily(task, /upload|file upload|上传|选择文件/u);
  }
  if (toolName.startsWith('bh_download_') || toolName.startsWith('bh_file_')) {
    return taskNeedsAdvancedFamily(task, /download|downloads|file|files|下载|文件/u);
  }
  if (toolName.startsWith('bh_clipboard_')) {
    return taskNeedsAdvancedFamily(task, /clipboard|copy|paste|剪贴板|复制|粘贴/u);
  }
  if (toolName.startsWith('bh_tab_')) {
    return taskNeedsAdvancedFamily(task, /tab|tabs|window|windows|标签|窗口|新页面|新标签/u);
  }
  if (toolName.startsWith('bh_storage_')) {
    return taskNeedsAdvancedFamily(task, /storage|localstorage|sessionstorage|cookie|cookies|browser state|浏览器存储|本地存储|会话存储|状态|缓存/u);
  }
  if (toolName.startsWith('bh_shadow_')) {
    return taskNeedsAdvancedFamily(task, /shadow|web component|shadow dom|影子|组件/u);
  }
  if (toolName.startsWith('bh_doc_')) {
    return taskNeedsAdvancedFamily(task, /pdf|document|doc|text file|文档|文件|资料/u);
  }
  return undefined;
}

function taskNeedsAdvancedFamily(task: string, pattern: RegExp): string | undefined {
  if (pattern.test(task)) {
    return undefined;
  }
  return 'Advanced tool family is not needed for current task';
}

export function toolRequiresExplicitDomainConsent(tool: ToolPromptContract): boolean {
  return tool.name.startsWith('bh_form_fill_') ||
    tool.name.startsWith('bh_form_submit') ||
    tool.name.startsWith('bh_action_') ||
    tool.name.startsWith('bh_pointer_') ||
    tool.name === TOOL_NAMES.TAB_FOCUS ||
    tool.name === TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL ||
    tool.name === TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL ||
    tool.name === TOOL_NAMES.FLOW_RUN_WITH_APPROVAL ||
    tool.name.startsWith('bh_storage_') ||
    (tool.risk === 'high' && !tool.readOnly) ||
    tool.name.startsWith('bh_debug_') ||
    tool.name.startsWith('bh_cdp_');
}

function matchesAllowedDomain(
  pageDomain: string,
  allowedDomains: string[] | undefined
): boolean {
  if (!allowedDomains?.length) {
    return false;
  }
  const normalizedPageDomain = normalizeDomain(pageDomain);
  if (!normalizedPageDomain) {
    return false;
  }
  return allowedDomains.some((domain) => {
    const normalized = normalizeDomain(domain);
    return normalized
      ? normalizedPageDomain === normalized || normalizedPageDomain.endsWith(`.${normalized}`)
      : false;
  });
}

function normalizeDomain(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    const normalized = value.toLowerCase().replace(/^\.+|\.+$/gu, '');
    return normalized.length > 0 ? normalized : undefined;
  }
}

function isLocalDevelopmentDomain(value: string): boolean {
  const normalized = normalizeDomain(value);
  return normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized?.endsWith('.localhost') === true;
}
