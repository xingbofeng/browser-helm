// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { buildObservation } from '../../../../src/page/observe/build-observation';
import { compressObservation } from '../../../../src/page/observe/observation-compressor';
import { readPageMetadata } from '../../../../src/page/observe/page-metadata';
import { readPageState } from '../../../../src/page/observe/page-state';
import { readVisibleText } from '../../../../src/page/observe/visible-text';
import { loadDomFixture } from '../../../helpers/dom-test-page';

describe('page observation', () => {
  it('reads URL, title, currentDomain and origin', () => {
    const page = loadDomFixture(
      'basic-form.html',
      'https://demo.example.com/register'
    );

    expect(readPageMetadata(page.document)).toEqual({
      url: 'https://demo.example.com/register',
      title: '欢迎注册 - 示例网站',
      currentDomain: 'demo.example.com',
      origin: 'https://demo.example.com',
      warnings: []
    });
  });

  it('extracts visible text with deterministic budget warnings', () => {
    const page = loadDomFixture(
      'basic-form.html',
      'https://demo.example.com/register'
    );

    const result = readVisibleText(page.document, { maxChars: 12 });

    expect(result.text.length).toBeLessThanOrEqual(12);
    expect(result.warnings).toContain('VISIBLE_TEXT_TRUNCATED');
  });

  it('keeps non-landmark body text when landmark navigation exists', () => {
    document.body.innerHTML = `
      <nav>Home Pricing Login</nav>
      <div>Critical checkout error: payment failed after submit</div>
    `;

    const result = readVisibleText(document, { maxChars: 200 });

    expect(result.text).toContain('Home Pricing Login');
    expect(result.text).toContain('Critical checkout error');
  });

  it('summarizes page state and empty reason', () => {
    const page = loadDomFixture(
      'basic-form.html',
      'https://demo.example.com/register'
    );

    const state = readPageState(page.document);

    expect(state.interactiveCount).toBe(5);
    expect(state.emptyReason).toBeUndefined();
  });

  it('builds observation and source-labelled context summary', () => {
    const page = loadDomFixture(
      'basic-form.html',
      'https://demo.example.com/register'
    );

    const observation = buildObservation(page.document);
    const summary = compressObservation(observation, {
      maxVisibleTextChars: 80,
      maxRefHighlights: 3
    });

    expect(observation.refSummary.map((ref) => ref.name)).toContain('提交');
    expect(summary.origin).toBe('https://demo.example.com');
    expect(summary.visibleTextSummary).toContain(
      '来自 https://demo.example.com 的页面文本'
    );
    expect(summary.refHighlights.length).toBeLessThanOrEqual(3);
  });

  it('keeps content links out of the navigation zone', () => {
    document.body.innerHTML = `
      <nav><a href="/pricing">Pricing</a></nav>
      <main><a href="/checkout">Checkout details</a></main>
    `;

    const observation = buildObservation(document);
    const zones = new Map(observation.refSummary.map((ref) => [ref.name, ref.pageZone]));

    expect(zones.get('Pricing')).toBe('nav');
    expect(zones.get('Checkout details')).toBe('content');
  });

  it('keeps prompt injection text as data in summaries', () => {
    const page = loadDomFixture(
      'security/prompt-injection.html',
      'https://evil.example/security'
    );

    const observation = buildObservation(page.document);
    const summary = compressObservation(observation);

    expect(observation.visibleText).toContain('ignore previous instructions');
    expect(summary.visibleTextSummary).toContain('ignore previous instructions');
    expect(summary.visibleTextSummary).toContain(
      '来自 https://evil.example 的页面文本'
    );
  });
});
