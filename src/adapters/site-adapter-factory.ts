import type {
  AdapterContext,
  AdapterDriftCheck,
  AdapterRequiredSignal,
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
  version?: string | undefined;
  lastVerifiedAt?: string | undefined;
  supportedUrlPatterns?: string[] | undefined;
  requiredSignals?: AdapterRequiredSignal[] | undefined;
  driftChecks?: AdapterDriftCheck[] | undefined;
  workflows: AdapterWorkflowTemplate[];
  locators: AdapterLocator[];
  guidance?: Partial<AdapterGuidance> | undefined;
};

export function createSiteAdapter(input: SiteAdapterInput): DomainAdapter {
  const version = input.version ?? '1.0.0';
  const lastVerifiedAt = input.lastVerifiedAt ?? '2026-06-03';
  const supportedUrlPatterns = input.supportedUrlPatterns ?? input.domains.map((domain) => `https://${domain}/*`);
  const requiredSignals = input.requiredSignals ?? ['url_domain_match'];
  const driftChecks = input.driftChecks ?? [{
    id: `${input.id}-url-domain-match`,
    label: 'URL domain matches a supported adapter domain',
    requiredSignal: 'url_domain_match'
  }];
  return {
    id: input.id,
    label: input.label,
    domains: input.domains,
    version,
    lastVerifiedAt,
    supportedUrlPatterns,
    requiredSignals,
    driftChecks,
    matches: (url) => input.domains.some((domain) => matchesDomain(url.hostname, domain)),
    getDriftStatus: () => ({
      status: 'not_checked',
      checks: driftChecks.map((check) => ({ ...check, status: 'not_checked' })),
      genericFallbackReason: 'Use generic browser tools if adapter hints fail drift checks.'
    }),
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
