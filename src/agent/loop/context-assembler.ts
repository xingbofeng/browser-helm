import type { BrowserHelmDomainPolicy } from '../../shared/domain-policy';
import type { RunSnapshot } from '../../runtime/runtime-messages';
import { resolveRuntimeCapabilities } from '../../runtime/capabilities/runtime-capabilities';
import type { ToolPromptContract } from '../../tools/core/tool-router';
import type { ModelMessage } from '../../shared/schemas/model-message.schema';
import { selectToolsForRun } from '../modes/tool-selector';
import { buildMessages } from './prompt-builder';
import type { RunRecord } from './types';

export type ToolSelectionPayload = {
  stepIndex: number;
  toolCount: number;
  toolNames: string[];
  hiddenToolCount?: number;
  limitations?: string[];
};

export type ContextAssemblerDeps = {
  getDomainPolicy?: (() => Promise<BrowserHelmDomainPolicy | undefined>) | undefined;
};

export type ContextAssemblerInput = {
  record: RunRecord & { tabId?: number | undefined };
  snapshot: RunSnapshot;
  tabId: number;
  stepIndex: number;
  allToolsContracts: ToolPromptContract[];
};

export type ContextAssemblerOutput = {
  domainPolicy: BrowserHelmDomainPolicy | undefined;
  toolsContracts: ToolPromptContract[];
  selectionPayload: ToolSelectionPayload;
  messages: ModelMessage[];
};

export class ContextAssembler {
  constructor(private readonly deps: ContextAssemblerDeps = {}) {}

  async assembleTurn(input: ContextAssemblerInput): Promise<ContextAssemblerOutput> {
    const domainPolicy = await this.deps.getDomainPolicy?.();
    const selectedTools = selectToolsForRun({
      mode: input.record.mode,
      task: input.record.task,
      tools: input.allToolsContracts,
      capabilities: input.snapshot.capabilities ?? resolveRuntimeCapabilities({
        hasActiveTab: Boolean(input.tabId)
      }),
      ...(this.deps.getDomainPolicy
        ? {
            permissions: {
              allowedDomains: domainPolicy?.enabledDomains ?? [],
              requireExplicitDomainConsent: true
            }
          }
        : {}),
      pendingApproval: input.snapshot.pendingApproval !== undefined,
      ...(input.snapshot.observation?.currentDomain
        ? { pageDomain: input.snapshot.observation.currentDomain }
        : {}),
      ...(input.snapshot.error?.code ? { lastError: { code: input.snapshot.error.code } } : {}),
      ...(input.snapshot.structuredPageData?.forms
        ? { pageState: { hasForm: input.snapshot.structuredPageData.forms.status !== 'empty' } }
        : {})
    });
    const selectedToolNames = new Set(selectedTools.visibleTools);
    const toolsContracts = input.allToolsContracts.filter((tool) => selectedToolNames.has(tool.name));
    const selectionPayload: ToolSelectionPayload = {
      stepIndex: input.stepIndex,
      toolCount: toolsContracts.length,
      toolNames: toolsContracts.map((tool) => tool.name)
    };
    if (selectedTools.limitations.length > 0) {
      selectionPayload.hiddenToolCount = selectedTools.hiddenTools.length;
      selectionPayload.limitations = selectedTools.limitations;
    }
    const messages = buildMessages({
      record: input.record,
      snapshot: input.snapshot,
      toolsContracts,
      locale: input.record.locale ?? 'zh',
      domainPolicy,
      requireProviderContextConsent: this.deps.getDomainPolicy !== undefined
    });
    return {
      domainPolicy,
      toolsContracts,
      selectionPayload,
      messages
    };
  }
}
