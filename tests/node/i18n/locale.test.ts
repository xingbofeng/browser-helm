import { describe, expect, it } from 'vitest';
import { normalizeLocale } from '../../../src/i18n/locale';

describe('normalizeLocale', () => {
  it('returns zh for null/undefined', () => {
    expect(normalizeLocale(null)).toBe('zh');
    expect(normalizeLocale(undefined)).toBe('zh');
    expect(normalizeLocale('')).toBe('zh');
  });

  it('returns en for en-* language tags', () => {
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('en-GB')).toBe('en');
  });

  it('returns zh for zh-* language tags', () => {
    expect(normalizeLocale('zh')).toBe('zh');
    expect(normalizeLocale('zh-CN')).toBe('zh');
    expect(normalizeLocale('zh-TW')).toBe('zh');
    expect(normalizeLocale('zh-hk')).toBe('zh');
  });

  it('returns zh for unknown languages', () => {
    expect(normalizeLocale('ja')).toBe('zh');
    expect(normalizeLocale('fr')).toBe('zh');
  });
});
