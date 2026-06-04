import type { RunMode } from '../../../../shared/schemas/tool.schema';
import type { ToolRisk } from '../../../../shared/schemas/tool-result.schema';
import type { RuntimeCapabilities } from '../../../../shared/schemas/runtime-capabilities.schema';
import type {
  BrowserHelmDomainPolicy,
  BrowserHelmDomainPolicyOperation
} from '../../../../shared/domain-policy';

export type RuntimeCapabilityRequirement =
  | 'activeTab'
  | 'debugger'
  | 'clipboard'
  | 'downloads'
  | 'storageInspection'
  | 'shallowDebug';

export type ToolAuthorizationContext = {
  runId: string;
  tool: string;
  title: string;
  argsPreview: unknown;
  runMode: RunMode;
  risk: ToolRisk;
  readOnly: boolean;
  requiresApproval: boolean;
  bypassPolicyApproval?: boolean | undefined;
  changedPageExpected?: boolean | undefined;
  source?: 'agent' | 'runtime' | 'user' | undefined;
  approvalResume?: boolean | undefined;
  userTask: string;
  pageDomain?: string | undefined;
  domainPolicy?: BrowserHelmDomainPolicy | undefined;
  domainOperation?: BrowserHelmDomainPolicyOperation | undefined;
  targetSummary?: string | undefined;
  capabilities?: RuntimeCapabilities | undefined;
  requiredCapability?: RuntimeCapabilityRequirement | undefined;
  userIntent?: {
    required: boolean;
    grounded: boolean;
    reason: string;
  } | undefined;
  firstMutationRequiresApproval?: boolean | undefined;
};

export type ToolAuthorizationDecision =
  | {
      allow: true;
      requiresApproval: false;
      reason: string;
      risk: ToolRisk;
    }
  | {
      allow: false;
      requiresApproval: true;
      reason: string;
      risk: ToolRisk;
      actionPreview: string;
    }
  | {
      allow: false;
      requiresApproval: false;
      code: string;
      reason: string;
      risk: ToolRisk;
    };

export type RuntimeToolPolicyLike = {
  evaluate: (
    risk: string,
    runMode?: RunMode
  ) => {
    allow: boolean;
    requiresApproval: boolean;
    reason: string;
    risk: string;
  };
};
