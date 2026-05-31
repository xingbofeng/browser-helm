import type { NetworkRequestRecord, RequestDetail } from '../../shared/schemas/network-request';
import { networkRequestRecordSchema, requestDetailSchema } from '../../shared/schemas/network-request';
import { redactCdpHeaders, redactCdpText, redactCdpUrl } from './cdp-redaction';

export class NetworkEventStore {
  private readonly records = new Map<string, NetworkRequestRecord>();
  private readonly requestBodies = new Map<string, string>();

  requestWillBeSent(payload: Record<string, unknown>, timestamp = Date.now()): void {
    const requestId = stringField(payload, 'requestId');
    const request = recordField(payload, 'request');
    if (!requestId || !request) {
      return;
    }
    const current = this.records.get(requestId);
    const record = networkRequestRecordSchema.parse({
      ...current,
      requestId,
      url: redactCdpUrl(stringField(request, 'url') ?? current?.url ?? 'unknown'),
      method: stringField(request, 'method') ?? current?.method ?? 'GET',
      requestHeadersPreview: redactCdpHeaders(request.headers),
      responseHeadersPreview: current?.responseHeadersPreview,
      failed: current?.failed ?? false,
      responseBodyAvailable: current?.responseBodyAvailable ?? false,
      timestamp
    });
    const postData = stringField(request, 'postData');
    if (postData) {
      this.requestBodies.set(requestId, redactCdpText(postData, 2_000));
    }
    this.records.set(requestId, record);
  }

  responseReceived(payload: Record<string, unknown>): void {
    const requestId = stringField(payload, 'requestId');
    const response = recordField(payload, 'response');
    if (!requestId || !response) {
      return;
    }
    const current = this.records.get(requestId);
    const record = networkRequestRecordSchema.parse({
      ...current,
      requestId,
      url: redactCdpUrl(stringField(response, 'url') ?? current?.url ?? 'unknown'),
      method: current?.method ?? 'GET',
      status: numberField(response, 'status'),
      mimeType: stringField(response, 'mimeType'),
      requestHeadersPreview: current?.requestHeadersPreview ?? {},
      responseHeadersPreview: redactCdpHeaders(response.headers),
      failed: false,
      responseBodyAvailable: true,
      timestamp: current?.timestamp ?? Date.now()
    });
    this.records.set(requestId, record);
  }

  loadingFailed(payload: Record<string, unknown>): void {
    const requestId = stringField(payload, 'requestId');
    if (!requestId) {
      return;
    }
    const current = this.records.get(requestId);
    this.records.set(requestId, networkRequestRecordSchema.parse({
      ...current,
      requestId,
      url: current?.url ?? 'unknown',
      method: current?.method ?? 'GET',
      requestHeadersPreview: current?.requestHeadersPreview ?? {},
      responseHeadersPreview: current?.responseHeadersPreview,
      failed: true,
      errorText: stringField(payload, 'errorText') ?? 'Network request failed',
      responseBodyAvailable: false,
      responseBodyUnavailableReason: 'request_failed',
      timestamp: current?.timestamp ?? Date.now()
    }));
  }

  loadingFinished(payload: Record<string, unknown>): void {
    const requestId = stringField(payload, 'requestId');
    if (!requestId) {
      return;
    }
    const current = this.records.get(requestId);
    if (current) {
      this.records.set(requestId, { ...current, responseBodyAvailable: true });
    }
  }

  list(): NetworkRequestRecord[] {
    return [...this.records.values()].sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0));
  }

  detail(requestId: string, responseBody?: { body: string; base64Encoded?: boolean | undefined }): RequestDetail | undefined {
    const record = this.records.get(requestId);
    if (!record) {
      return undefined;
    }
    return requestDetailSchema.parse({
      ...record,
      requestBodyPreview: this.requestBodies.get(requestId),
      ...(responseBody
        ? {
            responseBodyPreview: redactCdpText(responseBody.body),
            responseBase64Encoded: responseBody.base64Encoded === true
          }
        : {})
    });
  }
}

function recordField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}
