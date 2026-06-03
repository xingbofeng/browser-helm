import { describe, expect, it } from 'vitest';

import { groundVisionObservation } from '../../../../src/tools/vision/vision-grounding';
import type { VisionObservation } from '../../../../src/shared/schemas/vision';
import type { StructuredPageData } from '../../../../src/shared/schemas/structured-page-data.schema';

describe('groundVisionObservation', () => {
  it('marks overlay claims with DOM and a11y evidence when page text and refs agree', () => {
    const grounded = groundVisionObservation(vision({
      summary: 'Cookie banner overlaps the Checkout button',
      blockers: ['Cookie banner overlaps Checkout'],
      confidence: 0.92
    }), structuredPageData({
      visibleTextSummary: 'Cookie banner Checkout',
      interactiveName: 'Checkout'
    }));

    const claim = grounded.grounding.find((item) => item.claim === 'Cookie banner overlaps Checkout');
    expect(claim).toMatchObject({
      source: 'a11y_backed',
      confidence: 'high'
    });
    expect(claim?.evidence).toContainEqual({ kind: 'dom_text', text: 'Cookie banner Checkout' });
    expect(claim?.evidence).toContainEqual({ kind: 'a11y_ref', refId: 'ref_checkout', label: 'Checkout' });
    expect(grounded.pointerFallback).toMatchObject({
      allowed: true,
      targetConfidence: 'high',
      domRefUnavailable: true
    });
  });

  it('keeps layout claims visual-only when no DOM or a11y evidence supports them', () => {
    const grounded = groundVisionObservation(vision({
      summary: 'Primary CTA shifted below fold',
      layoutIssues: ['Primary CTA shifted below fold'],
      confidence: 0.86
    }), structuredPageData({
      visibleTextSummary: 'Product page',
      interactiveName: 'Subscribe'
    }));

    expect(grounded.grounding).toContainEqual(expect.objectContaining({
      claim: 'Primary CTA shifted below fold',
      source: 'visual_only',
      confidence: 'high',
      evidence: []
    }));
  });

  it('marks canvas-only visible text as visual-only instead of DOM-backed', () => {
    const grounded = groundVisionObservation(vision({
      summary: 'Canvas chart shows revenue trend',
      visibleText: ['Revenue grew 20%'],
      confidence: 0.8
    }), structuredPageData({
      visibleTextSummary: 'Dashboard canvas',
      interactiveName: 'Refresh'
    }));

    expect(grounded.grounding).toContainEqual(expect.objectContaining({
      claim: 'Revenue grew 20%',
      source: 'visual_only',
      evidence: []
    }));
  });

  it('marks vision unavailable fallback as unresolved with fallback reason', () => {
    const grounded = groundVisionObservation(vision({
      summary: 'Viewport screenshot captured, but vision is unavailable',
      fallback: 'dom_a11y',
      fallbackReason: 'vision_not_supported'
    }), structuredPageData({
      visibleTextSummary: 'Checkout',
      interactiveName: 'Checkout'
    }));

    expect(grounded.grounding).toContainEqual(expect.objectContaining({
      claim: 'Viewport screenshot captured, but vision is unavailable',
      source: 'unresolved',
      confidence: 'low',
      reason: 'vision_not_supported'
    }));
    expect(grounded.pointerFallback).toMatchObject({
      allowed: false,
      reason: 'vision_not_supported'
    });
  });
});

function vision(input: Partial<VisionObservation>): VisionObservation {
  return {
    summary: input.summary ?? 'Vision summary',
    visibleText: input.visibleText ?? [],
    blockers: input.blockers ?? [],
    layoutIssues: input.layoutIssues ?? [],
    fallback: input.fallback ?? 'none',
    grounding: [],
    ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
    ...(typeof input.confidence === 'number' ? { confidence: input.confidence } : {})
  };
}

function structuredPageData(input: {
  visibleTextSummary: string;
  interactiveName: string;
}): StructuredPageData {
  return {
    observation: {
      status: 'ready',
      summary: input.visibleTextSummary,
      count: 1,
      items: [{
        url: 'https://example.test',
        title: 'Fixture',
        currentDomain: 'example.test',
        origin: 'https://example.test',
        visibleTextSummary: input.visibleTextSummary,
        pageStateSummary: input.visibleTextSummary
      }],
      updatedAt: '2026-06-02T00:00:00.000Z',
      warnings: []
    },
    refs: {
      status: 'ready',
      summary: input.interactiveName,
      count: 1,
      items: [{
        refId: 'ref_checkout',
        role: 'button',
        name: input.interactiveName,
        tagName: 'button',
        visible: true,
        disabled: false
      }],
      updatedAt: '2026-06-02T00:00:00.000Z',
      warnings: []
    },
    interactive: {
      status: 'ready',
      summary: input.interactiveName,
      count: 1,
      items: [{
        refId: 'ref_checkout',
        role: 'button',
        name: input.interactiveName,
        tagName: 'button',
        visible: true,
        disabled: false,
        warnings: []
      }],
      updatedAt: '2026-06-02T00:00:00.000Z',
      warnings: []
    },
    forms: {
      status: 'ready',
      summary: 'No forms',
      count: 0,
      items: [],
      updatedAt: '2026-06-02T00:00:00.000Z',
      warnings: []
    }
  };
}
