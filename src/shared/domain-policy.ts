const RESTRICTED_DOMAIN_PATTERNS = [
  /(^|\.)bank(?:ing)?\./iu,
  /(^|\.)paypal\./iu,
  /(^|\.)stripe\./iu,
  /(^|\.)checkout\./iu,
  /(^|\.)pay(?:ment)?\./iu,
  /(^|\.)wallet\./iu,
  /(^|\.)medical\./iu,
  /(^|\.)health(?:care)?\./iu,
  /(^|\.)clinic\./iu,
  /(^|\.)hospital\./iu,
  /(^|\.)patient\./iu
];

export const BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY = 'browserHelmDomainPolicy';

export type BrowserHelmDomainPolicy = {
  /**
   * When omitted, ordinary http/https domains are enabled by default. When
   * provided and non-empty, only exact or subdomain matches are enabled.
   */
  enabledDomains?: string[] | undefined;
  blockedDomains?: string[] | undefined;
  allowRestrictedDomains?: boolean | undefined;
  defaultEnabled?: boolean | undefined;
};

export type BrowserHelmDomainPolicyDecision = {
  allowed: boolean;
  hostname?: string | undefined;
  restricted: boolean;
  reason?: string | undefined;
};

export type BrowserHelmDomainPolicyOperation =
  | 'observe'
  | 'provider_context'
  | 'debug_hook'
  | 'form_fill'
  | 'submit'
  | 'storage_read'
  | 'advanced_action';

export function isBrowserHelmDomainPolicy(value: unknown): value is BrowserHelmDomainPolicy {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRestrictedBrowserHelmDomain(input: string | URL | undefined): boolean {
  if (!input) {
    return false;
  }
  const hostname = readHostname(input);
  if (!hostname) {
    return false;
  }
  return RESTRICTED_DOMAIN_PATTERNS.some((pattern) => pattern.test(`.${hostname}.`));
}

export function evaluateBrowserHelmDomainPolicy(
  input: string | URL | undefined,
  policy: BrowserHelmDomainPolicy | undefined
): BrowserHelmDomainPolicyDecision {
  const hostname = input ? readHostname(input) : undefined;
  if (!hostname) {
    return { allowed: false, restricted: false, reason: 'DOMAIN_UNKNOWN' };
  }

  const restricted = isRestrictedBrowserHelmDomain(hostname);
  if (restricted && policy?.allowRestrictedDomains !== true) {
    return { allowed: false, hostname, restricted, reason: 'DOMAIN_RESTRICTED' };
  }

  if (matchesDomainList(hostname, policy?.blockedDomains)) {
    return { allowed: false, hostname, restricted, reason: 'DOMAIN_BLOCKED' };
  }

  if (policy?.enabledDomains && policy.enabledDomains.length > 0) {
    return matchesDomainList(hostname, policy.enabledDomains)
      ? { allowed: true, hostname, restricted }
      : { allowed: false, hostname, restricted, reason: 'DOMAIN_NOT_ENABLED' };
  }

  if (policy?.defaultEnabled === false) {
    return { allowed: false, hostname, restricted, reason: 'DOMAIN_NOT_ENABLED' };
  }

  return { allowed: true, hostname, restricted };
}

export function evaluateBrowserHelmDomainOperationPolicy(
  input: string | URL | undefined,
  policy: BrowserHelmDomainPolicy | undefined,
  operation: BrowserHelmDomainPolicyOperation
): BrowserHelmDomainPolicyDecision {
  if (operation === 'observe') {
    return evaluateBrowserHelmDomainPolicy(input, policy);
  }
  const hostname = input ? readHostname(input) : undefined;
  if (hostname && isLocalDevelopmentHostname(hostname)) {
    return { allowed: true, hostname, restricted: false };
  }
  return evaluateBrowserHelmDomainPolicy(input, {
    enabledDomains: policy?.enabledDomains ?? [],
    blockedDomains: policy?.blockedDomains,
    allowRestrictedDomains: policy?.allowRestrictedDomains,
    defaultEnabled: false
  });
}

function readHostname(input: string | URL): string | undefined {
  if (input instanceof URL) {
    return input.hostname.toLowerCase();
  }
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return input.toLowerCase().replace(/^\.+|\.+$/gu, '') || undefined;
  }
}

function matchesDomainList(hostname: string, domains: string[] | undefined): boolean {
  if (!domains?.length) {
    return false;
  }
  return domains.some((domain) => {
    const normalized = readHostname(domain);
    return normalized ? hostname === normalized || hostname.endsWith(`.${normalized}`) : false;
  });
}

function isLocalDevelopmentHostname(hostname: string): boolean {
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost');
}
