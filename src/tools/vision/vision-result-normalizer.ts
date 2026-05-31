import { visionObservationSchema, type VisionObservation } from '../../shared/schemas/vision';

const MAX_ITEMS = 12;
const MAX_TEXT = 500;

export function normalizeVisionObservation(value: unknown): VisionObservation {
  const record = isRecord(value) ? value : {};
  return visionObservationSchema.parse({
    imageRef: stringField(record, 'imageRef'),
    summary: truncate(stringField(record, 'summary') ?? 'Vision observation completed.'),
    visibleText: stringArray(record.visibleText).slice(0, MAX_ITEMS),
    blockers: stringArray(record.blockers).slice(0, MAX_ITEMS),
    layoutIssues: stringArray(record.layoutIssues).slice(0, MAX_ITEMS),
    fallback: record.fallback === 'dom_a11y' ? 'dom_a11y' : 'none',
    fallbackReason: stringField(record, 'fallbackReason'),
    confidence: clampConfidence(record.confidence)
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => truncate(item))
    : [];
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function clampConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, value));
}

function truncate(value: string): string {
  return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
