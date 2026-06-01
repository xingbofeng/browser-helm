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

export type AdapterContext = {
  url: URL;
  task?: string | undefined;
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
  matches(url: URL): boolean;
  getGuidance(ctx: AdapterContext): AdapterGuidance;
  listWorkflows(ctx: AdapterContext): AdapterWorkflowTemplate[];
  listLocators(ctx: AdapterContext): AdapterLocator[];
};

export type DetectedDomainAdapter = {
  id: AdapterId;
  label: string;
  domain: string;
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
