import { beforeEach, describe, expect, it } from 'vitest';

import { DomainAdapterRegistry, defaultDomainAdapterRegistry } from '../../../src/adapters/registry';
import { defaultDomainAdapterPreferences } from '../../../src/adapters/preferences';
import { githubAdapter } from '../../../src/adapters/github';

const adapterUrls = {
  github: 'https://github.com/openai/browser-helm/issues',
  gmail: 'https://mail.google.com/mail/u/0/#inbox',
  notion: 'https://example.notion.site/project',
  linear: 'https://linear.app/browser-helm/issue/BH-1/test',
  jira: 'https://browserhelm.atlassian.net/browse/BH-1',
  stripe: 'https://dashboard.stripe.com/customers',
  vercel: 'https://vercel.com/counter/browser-helm',
  supabase: 'https://app.supabase.com/project/example'
} as const;

describe('domain adapter registry', () => {
  beforeEach(() => {
    defaultDomainAdapterPreferences.clear();
  });

  it('detects supported domains and exposes guidance plus workflows', () => {
    const detection = defaultDomainAdapterRegistry.detect('https://github.com/openai/browser-helm/issues/1');

    expect(detection).toMatchObject({
      enabled: true,
      adapter: {
        id: 'github',
        label: 'GitHub'
      }
    });
    if (!detection.enabled) {
      throw new Error('Expected GitHub adapter detection');
    }
    expect(detection.adapter.guidance.summary).toContain('GitHub');
    expect(detection.adapter.workflows.map((workflow) => workflow.id)).toContain('github-open-issue');
  });

  it('returns a generic fallback when no supported adapter matches', () => {
    const detection = defaultDomainAdapterRegistry.detect('https://example.com/docs');

    expect(detection).toEqual({
      enabled: false,
      fallback: 'generic_browser_tools',
      reason: 'No domain adapter matches https://example.com'
    });
  });

  it('includes the first batch of v1.6 adapter skeletons', () => {
    expect(defaultDomainAdapterRegistry.list().map((adapter) => adapter.id)).toEqual([
      'github',
      'gmail',
      'notion',
      'linear',
      'jira',
      'stripe',
      'vercel',
      'supabase'
    ]);
  });

  it('exposes guidance, workflow, and locator hints for every first-batch adapter', () => {
    for (const [adapterId, url] of Object.entries(adapterUrls)) {
      const detection = defaultDomainAdapterRegistry.detect(url);
      expect(detection.enabled, adapterId).toBe(true);
      if (!detection.enabled) {
        throw new Error(`Expected ${adapterId} adapter detection`);
      }
      expect(detection.adapter.id).toBe(adapterId);
      expect(detection.adapter.guidance.summary.length).toBeGreaterThan(0);
      expect(detection.adapter.workflows.length).toBeGreaterThan(0);
      expect(detection.adapter.locators.length).toBeGreaterThan(0);
      expect(detection.adapter.version).toMatch(/^\d+\.\d+\.\d+$/u);
      expect(detection.adapter.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(detection.adapter.supportedUrlPatterns.length).toBeGreaterThan(0);
      expect(detection.adapter.requiredSignals).toContain('url_domain_match');
      expect(detection.adapter.driftStatus).toMatchObject({
        status: 'ok',
        checks: [
          expect.objectContaining({
            requiredSignal: 'url_domain_match',
            status: 'pass'
          })
        ],
        missingSignals: [],
        genericFallbackReason: 'Use generic browser tools if adapter hints fail drift checks.'
      });
    }
  });

  it('marks drift suspected when observed page signals contradict required adapter signals', () => {
    const registry = new DomainAdapterRegistry([githubAdapter]);
    const detection = registry.detect(adapterUrls.github, {
      observedSignals: {
        url_domain_match: false
      }
    });

    expect(detection.enabled).toBe(true);
    if (!detection.enabled) {
      throw new Error('Expected GitHub adapter detection');
    }
    expect(detection.adapter.driftStatus).toMatchObject({
      status: 'drift_suspected',
      checks: [
        expect.objectContaining({
          requiredSignal: 'url_domain_match',
          status: 'fail'
        })
      ],
      missingSignals: ['url_domain_match'],
      genericFallbackReason: 'Use generic browser tools if adapter hints fail drift checks.'
    });
  });

  it.each(Object.entries(adapterUrls))('keeps %s adapter skeleton executable through metadata only', (adapterId, url) => {
    const detection = defaultDomainAdapterRegistry.detect(url);
    expect(detection.enabled, adapterId).toBe(true);
    if (!detection.enabled) {
      throw new Error(`Expected ${adapterId} adapter detection`);
    }

    for (const workflow of detection.adapter.workflows) {
      expect(workflow.id).toContain(adapterId);
      expect(workflow.steps.length).toBeGreaterThan(0);
      expect(workflow.steps.every((step) => typeof step === 'string' && step.trim().length > 0)).toBe(true);
    }
    for (const locator of detection.adapter.locators) {
      expect(locator.id).toContain(adapterId);
      expect(locator.selectors.length + (locator.fallbackText?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  it('falls back to generic tools when the matched adapter is disabled by the user', () => {
    defaultDomainAdapterPreferences.setEnabled('github', false);

    const detection = defaultDomainAdapterRegistry.detect(adapterUrls.github);

    expect(detection).toEqual({
      enabled: false,
      fallback: 'generic_browser_tools',
      reason: 'GitHub adapter disabled by user',
      disabledAdapter: {
        id: 'github',
        label: 'GitHub',
        domain: 'github.com'
      }
    });
  });
});
