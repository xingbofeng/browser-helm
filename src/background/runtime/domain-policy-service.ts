import {
  evaluateBrowserHelmDomainOperationPolicy,
  type BrowserHelmDomainPolicy
} from '../../shared/domain-policy';
import type { SettingsStore } from '../../storage/interfaces/settings-store';

export type DomainPolicyServiceDeps = {
  settingsStore: SettingsStore;
};

export class DomainPolicyService {
  private readonly hasPolicyApi: boolean;
  private policyCache: BrowserHelmDomainPolicy | undefined;
  private policyCacheLoaded = false;

  constructor(private readonly deps: DomainPolicyServiceDeps) {
    this.hasPolicyApi = typeof deps.settingsStore.getDomainPolicy === 'function';
  }

  hasDomainPolicyApi(): boolean {
    return this.hasPolicyApi;
  }

  async refresh(): Promise<void> {
    if (!this.hasPolicyApi) {
      return;
    }
    this.policyCache = await this.deps.settingsStore.getDomainPolicy?.();
    this.policyCacheLoaded = true;
  }

  async getDomainPolicy(): Promise<BrowserHelmDomainPolicy | undefined> {
    if (!this.hasPolicyApi) {
      return undefined;
    }
    if (!this.policyCacheLoaded) {
      await this.refresh();
    }
    return this.policyCache;
  }

  canExposeMemoryReuse(domain: string | undefined): boolean {
    if (!domain) {
      return false;
    }
    if (!this.hasPolicyApi) {
      return true;
    }
    if (!this.policyCacheLoaded) {
      return false;
    }
    return evaluateDomainConsent(domain, this.policyCache).allowed;
  }
}

function evaluateDomainConsent(
  domain: string | undefined,
  policy: BrowserHelmDomainPolicy | undefined
) {
  if (domain && isLoopbackOrLocalhost(domain)) {
    return { allowed: true, hostname: domain, restricted: false };
  }
  return evaluateBrowserHelmDomainOperationPolicy(domain, policy, 'advanced_action');
}

function isLoopbackOrLocalhost(domain: string): boolean {
  const hostname = normalizeHostname(domain);
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost');
}

function normalizeHostname(domain: string): string {
  try {
    return new URL(`http://${domain}`).hostname.toLowerCase();
  } catch {
    return domain.toLowerCase().replace(/^\.+|\.+$/gu, '').replace(/:\d+$/u, '');
  }
}
