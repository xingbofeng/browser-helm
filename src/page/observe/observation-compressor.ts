import type {
  Observation,
  ObservationContextSummary
} from '../../shared/schemas/observation.schema';

export type ObservationCompressionOptions = {
  maxVisibleTextChars?: number;
  maxRefHighlights?: number;
};

export function compressObservation(
  observation: Observation,
  options: ObservationCompressionOptions = {}
): ObservationContextSummary {
  const maxVisibleTextChars = options.maxVisibleTextChars ?? 400;
  const maxRefHighlights = options.maxRefHighlights ?? 8;
  const visibleText = observation.visibleTextSummary || observation.visibleText;
  const truncated =
    visibleText.length > maxVisibleTextChars
      ? `${visibleText.slice(0, maxVisibleTextChars)}...`
      : visibleText;

  const warnings = [...observation.warnings];
  if (visibleText.length > maxVisibleTextChars) {
    warnings.push('OBSERVATION_SUMMARY_TRUNCATED');
  }

  return {
    url: observation.url,
    title: observation.title,
    currentDomain: observation.currentDomain,
    origin: observation.origin,
    pageStateSummary: observation.pageStateSummary,
    visibleTextSummary: `来自 ${observation.origin} 的页面文本: ${truncated}`,
    interactiveCount: observation.refSummary.length,
    refHighlights: observation.refSummary.slice(0, maxRefHighlights),
    warnings
  };
}
