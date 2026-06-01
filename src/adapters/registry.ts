import type {
  AdapterDetection,
  DetectedDomainAdapter,
  DomainAdapter
} from './adapter-types';
import { githubAdapter } from './github';
import { gmailAdapter } from './gmail';
import { notionAdapter } from './notion';
import { linearAdapter } from './linear';
import { jiraAdapter } from './jira';
import { stripeAdapter } from './stripe';
import { vercelAdapter } from './vercel';
import { supabaseAdapter } from './supabase';
import { defaultDomainAdapterPreferences } from './preferences';

export class DomainAdapterRegistry {
  constructor(private readonly adapters: DomainAdapter[]) {}

  list(): DomainAdapter[] {
    return [...this.adapters];
  }

  detect(rawUrl: string): AdapterDetection {
    const url = new URL(rawUrl);
    const adapter = this.adapters.find((candidate) => candidate.matches(url));
    if (!adapter) {
      return {
        enabled: false,
        fallback: 'generic_browser_tools',
        reason: `No domain adapter matches ${url.origin}`
      };
    }
    if (defaultDomainAdapterPreferences.isDisabled(adapter.id)) {
      return {
        enabled: false,
        fallback: 'generic_browser_tools',
        reason: `${adapter.label} adapter disabled by user`,
        disabledAdapter: {
          id: adapter.id,
          label: adapter.label,
          domain: adapter.domains[0] ?? url.hostname
        }
      };
    }
    return {
      enabled: true,
      adapter: detectedAdapter(adapter, url)
    };
  }
}

export const defaultDomainAdapterRegistry = new DomainAdapterRegistry([
  githubAdapter,
  gmailAdapter,
  notionAdapter,
  linearAdapter,
  jiraAdapter,
  stripeAdapter,
  vercelAdapter,
  supabaseAdapter
]);

function detectedAdapter(adapter: DomainAdapter, url: URL): DetectedDomainAdapter {
  const ctx = { url };
  return {
    id: adapter.id,
    label: adapter.label,
    domain: adapter.domains[0] ?? url.hostname,
    guidance: adapter.getGuidance(ctx),
    workflows: adapter.listWorkflows(ctx),
    locators: adapter.listLocators(ctx)
  };
}
