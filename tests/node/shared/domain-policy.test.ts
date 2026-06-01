import { describe, expect, it } from 'vitest';

import {
  evaluateBrowserHelmDomainPolicy,
  evaluateBrowserHelmDomainOperationPolicy,
  isRestrictedBrowserHelmDomain
} from '../../../src/shared/domain-policy';

describe('BrowserHelm domain policy', () => {
  it('restricts banking, payment, and medical domains by default', () => {
    expect(isRestrictedBrowserHelmDomain('https://secure.bank.example/login')).toBe(true);
    expect(isRestrictedBrowserHelmDomain('https://checkout.example.com/pay')).toBe(true);
    expect(isRestrictedBrowserHelmDomain('https://patient.clinic.example')).toBe(true);
  });

  it('allows ordinary local and documentation domains', () => {
    expect(isRestrictedBrowserHelmDomain('http://127.0.0.1:3000/basic-form.html')).toBe(false);
    expect(isRestrictedBrowserHelmDomain('https://docs.example.com')).toBe(false);
  });

  it('allows ordinary domains by default and blocks restricted domains', () => {
    expect(evaluateBrowserHelmDomainPolicy('https://docs.example.com', undefined)).toMatchObject({
      allowed: true,
      hostname: 'docs.example.com',
      restricted: false
    });
    expect(evaluateBrowserHelmDomainPolicy('https://secure.bank.example/login', undefined)).toMatchObject({
      allowed: false,
      restricted: true,
      reason: 'DOMAIN_RESTRICTED'
    });
  });

  it('distinguishes read-only observe from mutating and diagnostic operations', () => {
    expect(evaluateBrowserHelmDomainOperationPolicy('https://docs.example.com', undefined, 'observe')).toMatchObject({
      allowed: true,
      hostname: 'docs.example.com'
    });
    expect(evaluateBrowserHelmDomainOperationPolicy('https://docs.example.com', undefined, 'form_fill')).toMatchObject({
      allowed: false,
      hostname: 'docs.example.com',
      reason: 'DOMAIN_NOT_ENABLED'
    });
    expect(evaluateBrowserHelmDomainOperationPolicy('https://docs.example.com', undefined, 'debug_hook')).toMatchObject({
      allowed: false,
      reason: 'DOMAIN_NOT_ENABLED'
    });
    expect(evaluateBrowserHelmDomainOperationPolicy('https://docs.example.com', undefined, 'storage_read')).toMatchObject({
      allowed: false,
      reason: 'DOMAIN_NOT_ENABLED'
    });
    expect(evaluateBrowserHelmDomainOperationPolicy('http://127.0.0.1:3000', undefined, 'storage_read')).toMatchObject({
      allowed: true,
      hostname: '127.0.0.1'
    });
  });

  it('supports explicit enabled and blocked domain lists', () => {
    expect(evaluateBrowserHelmDomainPolicy('https://app.example.com', {
      enabledDomains: ['example.com']
    }).allowed).toBe(true);
    expect(evaluateBrowserHelmDomainPolicy('https://other.test', {
      enabledDomains: ['example.com']
    })).toMatchObject({
      allowed: false,
      reason: 'DOMAIN_NOT_ENABLED'
    });
    expect(evaluateBrowserHelmDomainPolicy('https://app.example.com', {
      enabledDomains: ['example.com'],
      blockedDomains: ['app.example.com']
    })).toMatchObject({
      allowed: false,
      reason: 'DOMAIN_BLOCKED'
    });
  });

  it('requires an explicit override before restricted domains can run', () => {
    expect(evaluateBrowserHelmDomainPolicy('https://secure.bank.example/login', {
      enabledDomains: ['bank.example']
    })).toMatchObject({
      allowed: false,
      reason: 'DOMAIN_RESTRICTED'
    });
    expect(evaluateBrowserHelmDomainPolicy('https://secure.bank.example/login', {
      enabledDomains: ['bank.example'],
      allowRestrictedDomains: true
    })).toMatchObject({
      allowed: true,
      restricted: true
    });
  });
});
