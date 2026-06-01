import type {
  AdapterContext,
  AdapterGuidance,
  AdapterId,
  AdapterLocator,
  AdapterWorkflowTemplate,
  DomainAdapter
} from './adapter-types';

type SiteAdapterInput = {
  id: AdapterId;
  label: string;
  domains: string[];
  workflows: AdapterWorkflowTemplate[];
  locators: AdapterLocator[];
  guidance?: Partial<AdapterGuidance> | undefined;
};

export function createSiteAdapter(input: SiteAdapterInput): DomainAdapter {
  return {
    id: input.id,
    label: input.label,
    domains: input.domains,
    matches: (url) => input.domains.some((domain) => matchesDomain(url.hostname, domain)),
    getGuidance: () => ({
      summary: input.guidance?.summary ?? `${input.label} adapter is active. Prefer known navigation, stable labels, and workflow templates before broad exploration.`,
      do: input.guidance?.do ?? [
        `Use ${input.label} workflow templates when the task matches a known flow.`,
        'Prefer adapter locator hints as candidates, then verify with current page observation.',
        'Fall back to generic browser tools when a locator or workflow does not match the page.'
      ],
      avoid: input.guidance?.avoid ?? [
        'Do not assume adapter hints are authoritative after the site UI changes.',
        'Do not repeat a failed locator without refreshing observation or choosing a generic fallback.'
      ],
      approvalReminder: input.guidance?.approvalReminder ?? 'Adapter guidance never bypasses global approval policy; high-risk actions still require approval.'
    }),
    listWorkflows: (_ctx: AdapterContext) => input.workflows,
    listLocators: (_ctx: AdapterContext) => input.locators
  };
}

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}
