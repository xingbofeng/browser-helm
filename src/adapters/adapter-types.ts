import type { ToolRisk } from '../shared/schemas/tool-result.schema';

export type AdapterId =
  | 'github'
  | 'gmail'
  | 'notion'
  | 'linear'
  | 'jira'
  | 'stripe'
  | 'vercel'
  | 'supabase';

export type DomainAdapterRuntimeBehavior =
  | 'versioning'
  | 'locator_verification'
  | 'drift_detection'
  | 'failure_reporting'
  | 'policy_composition';

export type AdapterRequiredSignal = 'url_domain_match';
export type AdapterObservedSignals = Partial<Record<AdapterRequiredSignal, boolean>>;

export type AdapterDriftCheck = {
  id: string;
  label: string;
  requiredSignal: AdapterRequiredSignal;
};

export type AdapterDriftCheckResult = AdapterDriftCheck & {
  status: 'not_checked' | 'pass' | 'fail';
};

export type AdapterDriftStatus = {
  status: 'not_checked' | 'ok' | 'drift_suspected';
  checks: AdapterDriftCheckResult[];
  missingSignals: AdapterRequiredSignal[];
  genericFallbackReason: string;
};

export const DOMAIN_ADAPTER_RUNTIME_CONTRACT = {
  productConcept: 'DomainAdapter',
  executionModel: 'non_executing_hints',
  genericFallback: 'generic_browser_tools',
  approvalPolicy: 'global_policy_always_enforced',
  requiredRuntimeBehaviors: [
    'versioning',
    'locator_verification',
    'drift_detection',
    'failure_reporting',
    'policy_composition'
  ]
} as const satisfies {
  productConcept: 'DomainAdapter';
  executionModel: 'non_executing_hints';
  genericFallback: 'generic_browser_tools';
  approvalPolicy: 'global_policy_always_enforced';
  requiredRuntimeBehaviors: readonly DomainAdapterRuntimeBehavior[];
};

export type AdapterContext = {
  url: URL;
  task?: string | undefined;
  observedSignals?: AdapterObservedSignals | undefined;
};

export type AdapterGuidance = {
  summary: string;
  do: string[];
  avoid: string[];
  approvalReminder: string;
};

export type AdapterWorkflowTemplate = {
  id: string;
  title: string;
  intent: string;
  risk: ToolRisk;
  requiresApproval: boolean;
  steps: string[];
};

export type AdapterLocator = {
  id: string;
  label: string;
  selectors: string[];
  fallbackText?: string[] | undefined;
  risk: ToolRisk;
};

export type DomainAdapter = {
  id: AdapterId;
  label: string;
  domains: string[];
  version: string;
  lastVerifiedAt: string;
  supportedUrlPatterns: string[];
  requiredSignals: AdapterRequiredSignal[];
  driftChecks: AdapterDriftCheck[];
  matches(url: URL): boolean;
  getDriftStatus(ctx: AdapterContext): AdapterDriftStatus;
  getGuidance(ctx: AdapterContext): AdapterGuidance;
  listWorkflows(ctx: AdapterContext): AdapterWorkflowTemplate[];
  listLocators(ctx: AdapterContext): AdapterLocator[];
};

export type DetectedDomainAdapter = {
  id: AdapterId;
  label: string;
  domain: string;
  version: string;
  lastVerifiedAt: string;
  supportedUrlPatterns: string[];
  matchedUrlPattern: string;
  requiredSignals: AdapterRequiredSignal[];
  driftChecks: AdapterDriftCheck[];
  driftStatus: AdapterDriftStatus;
  guidance: AdapterGuidance;
  workflows: AdapterWorkflowTemplate[];
  locators: AdapterLocator[];
};

export type AdapterDetection =
  | {
      enabled: true;
      adapter: DetectedDomainAdapter;
    }
  | {
      enabled: false;
      fallback: 'generic_browser_tools';
      reason: string;
      disabledAdapter?: {
        id: AdapterId;
        label: string;
        domain: string;
      } | undefined;
    };
