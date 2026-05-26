// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { buildObservation } from '../../../../src/page/observe/build-observation';
import {
  buildStructuredPageContextSummary,
  buildStructuredPageData
} from '../../../../src/page/structured/structured-page-data';
import type { Observation } from '../../../../src/shared/schemas/observation.schema';
import { loadDomFixture } from '../../../helpers/dom-test-page';

describe('structured page data builder', () => {
  it('builds four tab data categories from a successful observation', () => {
    const page = loadDomFixture(
      'basic-form.html',
      'https://demo.example.com/register'
    );
    const observation = buildObservation(page.document);

    const structured = buildStructuredPageData(observation, {
      updatedAt: '2026-05-24T05:00:00.000Z'
    });

    expect(structured.observation.status).toBe('ready');
    expect(structured.observation.items[0]).toMatchObject({
      url: 'https://demo.example.com/register',
      title: '欢迎注册 - 示例网站',
      origin: 'https://demo.example.com'
    });
    expect(structured.refs.status).toBe('ready');
    expect(structured.refs.count).toBe(observation.refSummary.length);
    expect(structured.interactive.status).toBe('ready');
    expect(structured.interactive.items.map((item) => item.refId)).toEqual(
      observation.refSummary.map((item) => item.refId)
    );
    expect(structured.forms.status).toBe('ready');
    expect(structured.forms.summary).toContain('字段');
    expect(structured.forms.emptyReason).toBeUndefined();
  });

  it('uses v0.31 interactive element data instead of shallow ref-only derivation', () => {
    const page = loadDomFixture(
      'v0-31-interactive-complete.html',
      'https://demo.example.com/interactive'
    );
    const observation = buildObservation(page.document);

    const structured = buildStructuredPageData(observation, {
      updatedAt: '2026-05-24T05:00:00.000Z'
    });

    expect(structured.interactive.summary).toContain('交互元素');
    expect(structured.interactive.summary).not.toContain('浅层派生');
    expect(structured.interactive.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'switch',
          name: '启用同步',
          checked: true
        }),
        expect.objectContaining({
          role: 'option',
          name: '中国',
          selected: true
        })
      ])
    );
    expect(structured.interactive.items[0]).toHaveProperty('domOrder');
    expect(structured.interactive.items[0]).toHaveProperty('warnings');
  });

  it('uses empty state when refs were checked and none were found', () => {
    const structured = buildStructuredPageData(emptyObservation(), {
      updatedAt: '2026-05-24T05:00:00.000Z'
    });

    expect(structured.refs.status).toBe('empty');
    expect(structured.refs.emptyReason).toBe('NO_REFS_DETECTED');
    expect(structured.interactive.status).toBe('empty');
    expect(structured.interactive.emptyReason).toBe(
      'NO_INTERACTIVE_ELEMENTS_DETECTED'
    );
    expect(structured.forms.status).toBe('unsupported');
  });

  it('builds deterministic context summary without full tab items', () => {
    const page = loadDomFixture(
      'basic-form.html',
      'https://demo.example.com/register'
    );
    const structured = buildStructuredPageData(buildObservation(page.document), {
      updatedAt: '2026-05-24T05:00:00.000Z'
    });

    const summary = buildStructuredPageContextSummary(structured, {
      maxHighlights: 2
    });

    expect(summary.origin).toBe('https://demo.example.com');
    expect(summary.counts.refs).toBe(structured.refs.count);
    expect(summary.highlights.length).toBeLessThanOrEqual(2);
    expect(summary.summary).toContain('字段');
    expect(summary.summary).toContain('|');
    expect(summary.summary).not.toContain('valuePreview');
    expect(summary.summary).not.toContain('[MASKED]');
    expect(JSON.stringify(summary)).not.toContain('items');
  });
});

function emptyObservation(): Observation {
  return {
    url: 'https://demo.example.com/empty',
    title: '空页面',
    currentDomain: 'demo.example.com',
    origin: 'https://demo.example.com',
    visibleText: '空页面',
    visibleTextSummary: '空页面',
    pageStateSummary: '页面没有可交互元素',
    refSummary: [],
    warnings: []
  };
}
