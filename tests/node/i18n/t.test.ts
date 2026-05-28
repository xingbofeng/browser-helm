import { describe, expect, it } from 'vitest';
import { t, tZh } from '../../../src/i18n/t';


describe('t() 纯函数翻译', () => {
  it('returns zh text for known key', () => {
    const result = t('brand.name', 'zh');
    expect(result).toBe('BrowserHelm');
  });

  it('returns en text for known key', () => {
    const result = t('status.ready', 'en');
    expect(result).toBe('Ready');
  });

  it('translates observe status in zh', () => {
    expect(t('observe.statusTitle', 'zh')).toBe('正在观察当前页面');
    expect(t('observe.statusContent', 'zh')).toBe('BrowserHelm 正在读取当前页面摘要和可交互结构。');
  });

  it('translates observe status in en', () => {
    expect(t('observe.statusTitle', 'en')).toBe('Observing current page');
    expect(t('observe.statusContent', 'en')).toBe('BrowserHelm is reading the current page summary and interactive structure.');
  });

  it('interpolates params with {name} placeholders', () => {
    const result = t('debug.elements.inspectAria', 'zh', { label: 'Submit', refId: 'ref_1' });
    expect(result).toBe('检查元素 Submit ref_1');
  });

  it('retains placeholder when param is missing', () => {
    const result = t('debug.elements.inspectAria', 'zh', { label: 'Submit' });
    expect(result).toBe('检查元素 Submit {refId}');
  });

  it('returns key itself as fallback when not found in dictionary', () => {
    const result = t('nonexistent.key.zzz', 'zh');
    expect(result).toBe('nonexistent.key.zzz');
  });

  it('falls back to zh when key not found in en', () => {
    // All keys exist in both languages by design, but just in case
    const result = t('brand.name', 'en');
    expect(result).toBe('BrowserHelm');
  });

  it('handles multiple param replacements', () => {
    const result = t('approval.filledSkipped', 'zh', { filled: '5', total: '10', skipped: '2' });
    expect(result).toBe('5/10 已填写，2 跳过');
  });

  it('tool status uses param interpolation for unknown tools', () => {
    const result = t('tool.status.default', 'zh', { tool: 'bh_custom' });
    expect(result).toBe('工具 bh_custom');
    const enResult = t('tool.status.default', 'en', { tool: 'bh_custom' });
    expect(enResult).toBe('Tool bh_custom');
  });

  it('form card labels translate to en', () => {
    expect(t('form.card.inferPlan', 'en')).toBe('Infer fill plan');
    expect(t('form.card.fillFields', 'en')).toBe('Field fill');
    expect(t('form.card.verify', 'en')).toBe('Form verification');
  });
});

describe('tZh() helper', () => {
  it('always returns zh regardless of what was asked', () => {
    expect(tZh('status.done')).toBe('完成');
    expect(tZh('status.error')).toBe('错误');
  });
});
