import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../../src/i18n/context';
import { DomainAdapterStatus } from '../../../../src/ui/components/domain-adapter-status';

describe('DomainAdapterStatus', () => {
  it('renders enabled adapter state with workflow count', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en">
        <DomainAdapterStatus
          adapter={{
            enabled: true,
            id: 'github',
            label: 'GitHub',
            workflowCount: 1,
            locatorCount: 1,
            approvalEnforced: true
          }}
        />
      </I18nProvider>
    );

    expect(html).toContain('GitHub adapter');
    expect(html).toContain('1 workflow hint');
    expect(html).toContain('Global approval policy still enforced');
  });

  it('renders generic fallback state when no adapter is enabled', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en">
        <DomainAdapterStatus
          adapter={{
            enabled: false,
            fallback: 'generic_browser_tools',
            reason: 'No domain adapter matches https://example.com'
          }}
        />
      </I18nProvider>
    );

    expect(html).toContain('Generic browser tools');
  });

  it('renders a disable control for an enabled adapter', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en">
        <DomainAdapterStatus
          adapter={{
            enabled: true,
            id: 'github',
            label: 'GitHub',
            workflowCount: 1,
            locatorCount: 1,
            approvalEnforced: true
          }}
          onSetEnabled={() => undefined}
        />
      </I18nProvider>
    );

    expect(html).toContain('Disable GitHub adapter');
  });

  it('renders drift fallback and last failure visibility for enabled adapters', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en">
        <DomainAdapterStatus
          adapter={{
            enabled: true,
            id: 'github',
            label: 'GitHub',
            workflowCount: 1,
            locatorCount: 1,
            approvalEnforced: true,
            driftStatus: {
              status: 'drift_suspected',
              genericFallbackReason: 'Use generic browser tools if adapter hints fail drift checks.'
            },
            lastFailure: {
              adapterId: 'github',
              errorCode: 'ADAPTER_LOCATOR_FAILED',
              locatorId: 'github-issues-tab',
              message: 'Locator github-issues-tab did not match observed candidates.'
            }
          }}
        />
      </I18nProvider>
    );

    expect(html).toContain('Drift suspected');
    expect(html).toContain('Use generic browser tools if adapter hints fail drift checks.');
    expect(html).toContain('Last failure: ADAPTER_LOCATOR_FAILED');
    expect(html).toContain('github-issues-tab');
  });

  it('renders an enable control for a disabled matched adapter', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en">
        <DomainAdapterStatus
          adapter={{
            enabled: false,
            fallback: 'generic_browser_tools',
            reason: 'GitHub adapter disabled by user',
            disabledAdapter: {
              id: 'github',
              label: 'GitHub'
            }
          }}
          onSetEnabled={() => undefined}
        />
      </I18nProvider>
    );

    expect(html).toContain('Enable GitHub adapter');
  });
});
