import { describe, expect, it } from 'vitest';
import { normalizeLocale } from '../../../src/i18n/locale';

describe('locale bootstrap', () => {
  describe('normalizeLocale', () => {
    it('returns zh for undefined input', () => {
      expect(normalizeLocale(undefined)).toBe('zh');
    });

    it('returns zh for null input', () => {
      expect(normalizeLocale(null)).toBe('zh');
    });

    it('returns zh for empty string', () => {
      expect(normalizeLocale('')).toBe('zh');
    });

    it('returns en for en input', () => {
      expect(normalizeLocale('en')).toBe('en');
    });

    it('returns en for en-US input', () => {
      expect(normalizeLocale('en-US')).toBe('en');
    });

    it('returns en for en_GB input', () => {
      expect(normalizeLocale('en_GB')).toBe('en');
    });

    it('returns zh for zh input', () => {
      expect(normalizeLocale('zh')).toBe('zh');
    });

    it('returns zh for zh-CN input', () => {
      expect(normalizeLocale('zh-CN')).toBe('zh');
    });

    it('returns zh for zh_TW input', () => {
      expect(normalizeLocale('zh_TW')).toBe('zh');
    });

    it('returns zh for unknown locale', () => {
      expect(normalizeLocale('fr')).toBe('zh');
    });

    it('handles uppercase input', () => {
      expect(normalizeLocale('EN')).toBe('en');
      expect(normalizeLocale('ZH')).toBe('zh');
    });

    it('handles mixed case input', () => {
      expect(normalizeLocale('En-Us')).toBe('en');
    });
  });
});
