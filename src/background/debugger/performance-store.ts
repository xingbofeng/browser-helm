import type { CdpPerformanceSnapshot } from '../../shared/schemas/cdp-event';
import { cdpPerformanceSnapshotSchema } from '../../shared/schemas/cdp-event';

export function buildPerformanceSnapshot(
  tabId: number,
  rawMetrics: unknown[],
  collectedAt = Date.now()
): CdpPerformanceSnapshot {
  return cdpPerformanceSnapshotSchema.parse({
    tabId,
    collectedAt,
    metrics: rawMetrics.flatMap((item) => {
      if (!isRecord(item) || typeof item.name !== 'string' || typeof item.value !== 'number') {
        return [];
      }
      return [{ name: item.name, value: item.value }];
    })
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
