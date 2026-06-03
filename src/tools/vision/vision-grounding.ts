import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import { visionObservationSchema, type VisionObservation } from '../../shared/schemas/vision';

type VisionGroundingSource = VisionObservation['grounding'][number]['source'];
type VisionGroundingConfidence = VisionObservation['grounding'][number]['confidence'];
type VisionGroundingEvidence = VisionObservation['grounding'][number]['evidence'][number];

const MIN_HIGH_CONFIDENCE = 0.8;
const MIN_MEDIUM_CONFIDENCE = 0.5;
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'button',
  'control',
  'is',
  'of',
  'on',
  'the',
  'to'
]);

export function groundVisionObservation(
  observation: VisionObservation,
  pageData?: StructuredPageData
): VisionObservation {
  const fallbackReason = observation.fallbackReason;
  const confidence = confidenceBucket(observation.confidence);
  if (observation.fallback === 'dom_a11y') {
    return visionObservationSchema.parse({
      ...observation,
      grounding: [{
        claim: observation.summary,
        source: 'unresolved',
        confidence: 'low',
        evidence: [],
        ...(fallbackReason ? { reason: fallbackReason } : {})
      }],
      pointerFallback: {
        allowed: false,
        reason: fallbackReason ?? 'vision_unavailable'
      }
    });
  }

  const claims = claimsFromObservation(observation);
  const grounding = claims.map((claim) => {
    const evidence = evidenceForClaim(claim, pageData);
    return {
      claim,
      source: sourceForEvidence(evidence, observation.confidence),
      confidence,
      evidence,
      ...(evidence.length === 0 && confidence === 'low' ? { reason: 'no_supporting_dom_or_a11y_evidence' } : {})
    };
  });
  const hasHighConfidenceTarget = grounding.some((claim) =>
    claim.confidence === 'high' &&
    (claim.source === 'visual_only' || claim.source === 'dom_backed' || claim.source === 'a11y_backed') &&
    (observation.blockers.includes(claim.claim) || observation.layoutIssues.includes(claim.claim))
  );
  return visionObservationSchema.parse({
    ...observation,
    grounding,
    pointerFallback: {
      allowed: hasHighConfidenceTarget,
      ...(hasHighConfidenceTarget ? {
        targetConfidence: 'high',
        domRefUnavailable: true,
        reason: 'high_confidence_visual_fallback_target'
      } : {
        reason: 'no_high_confidence_visual_fallback_target'
      })
    }
  });
}

function claimsFromObservation(observation: VisionObservation): string[] {
  const claims = [
    ...observation.blockers,
    ...observation.layoutIssues,
    ...observation.visibleText
  ].filter((claim) => claim.trim().length > 0);
  return claims.length > 0 ? unique(claims) : [observation.summary];
}

function evidenceForClaim(
  claim: string,
  pageData: StructuredPageData | undefined
): VisionGroundingEvidence[] {
  if (!pageData) {
    return [];
  }
  const evidence: VisionGroundingEvidence[] = [];
  const visibleSummary = unique([
    pageData.observation.summary,
    ...pageData.observation.items.flatMap((item) => [item.visibleTextSummary, item.pageStateSummary])
  ]).join(' ');
  if (hasMeaningfulOverlap(claim, visibleSummary, 2)) {
    evidence.push({
      kind: 'dom_text',
      text: truncateEvidence(visibleSummary)
    });
  }
  const ref = [...pageData.refs.items, ...pageData.interactive.items].find((item) =>
    item.visible !== false &&
    hasMeaningfulOverlap(claim, `${item.name ?? ''} ${item.role ?? ''} ${item.tagName}`, 1)
  );
  if (ref) {
    evidence.push({
      kind: 'a11y_ref',
      refId: ref.refId,
      label: ref.name ?? ref.role ?? ref.tagName
    });
  }
  return evidence;
}

function sourceForEvidence(
  evidence: VisionGroundingEvidence[],
  numericConfidence: number | undefined
): VisionGroundingSource {
  if (evidence.some((item) => item.kind === 'a11y_ref')) {
    return 'a11y_backed';
  }
  if (evidence.some((item) => item.kind === 'dom_text')) {
    return 'dom_backed';
  }
  return confidenceBucket(numericConfidence) === 'low' ? 'unresolved' : 'visual_only';
}

function confidenceBucket(value: number | undefined): VisionGroundingConfidence {
  if (typeof value !== 'number') {
    return 'low';
  }
  if (value >= MIN_HIGH_CONFIDENCE) {
    return 'high';
  }
  if (value >= MIN_MEDIUM_CONFIDENCE) {
    return 'medium';
  }
  return 'low';
}

function hasMeaningfulOverlap(claim: string, sourceText: string, minimum: number): boolean {
  const source = normalizeText(sourceText);
  const tokens = tokenSet(claim);
  if (tokens.length === 0 || source.length === 0) {
    return false;
  }
  const matches = tokens.filter((token) => source.includes(token));
  return matches.length >= Math.min(minimum, tokens.length);
}

function tokenSet(value: string): string[] {
  return unique(normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token)));
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function truncateEvidence(value: string): string {
  return value.length > 180 ? `${value.slice(0, 180)}...` : value;
}
