import { describe, expect, it } from 'vitest';

import { redactCdpHeaders, redactCdpText, redactCdpUrl } from '../../../../src/background/debugger/cdp-redaction';
import { NetworkEventStore } from '../../../../src/background/debugger/network-event-store';

describe('CDP network event store', () => {
  it('redacts sensitive request and response headers in stored records', () => {
    const store = new NetworkEventStore();

    store.requestWillBeSent({
      requestId: 'req_1',
      request: {
        url: 'https://api.example.com/users?token=secret#frag',
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret-token',
          Cookie: 'sid=secret',
          Accept: 'application/json'
        },
        postData: 'api_key=sk-1234567890abcdef&name=Alice'
      }
    }, 100);
    store.responseReceived({
      requestId: 'req_1',
      response: {
        url: 'https://api.example.com/users?token=secret#frag',
        status: 500,
        mimeType: 'application/json',
        headers: {
          'Set-Cookie': 'sid=secret',
          'Content-Type': 'application/json'
        }
      }
    });

    const [record] = store.list();
    expect(record).toMatchObject({
      requestId: 'req_1',
      url: 'https://api.example.com/users?token=%5BREDACTED%5D',
      method: 'POST',
      status: 500,
      requestHeadersPreview: {
        Authorization: '[MASKED]',
        Cookie: '[MASKED]',
        Accept: 'application/json'
      },
      responseHeadersPreview: {
        'Set-Cookie': '[MASKED]',
        'Content-Type': 'application/json'
      }
    });

    const detail = store.detail('req_1', {
      body: '{"token":"sk-1234567890abcdef","ok":false}'
    });
    expect(detail?.requestBodyPreview).toContain('[MASKED]');
    expect(detail?.responseBodyPreview).toContain('[MASKED]');
  });

  it('marks failed requests as response-body unavailable', () => {
    const store = new NetworkEventStore();

    store.requestWillBeSent({
      requestId: 'req_failed',
      request: {
        url: 'https://api.example.com/fail',
        method: 'GET',
        headers: {}
      }
    }, 101);
    store.loadingFailed({
      requestId: 'req_failed',
      errorText: 'net::ERR_FAILED'
    });

    expect(store.detail('req_failed')).toMatchObject({
      failed: true,
      errorText: 'net::ERR_FAILED',
      responseBodyAvailable: false,
      responseBodyUnavailableReason: 'request_failed'
    });
  });
});

describe('CDP redaction helpers', () => {
  it('masks sensitive headers, URL query values, and long text', () => {
    expect(redactCdpHeaders({
      Cookie: 'sid=secret',
      'X-Api-Key': 'sk-secret',
      Accept: 'application/json'
    })).toEqual({
      Cookie: '[MASKED]',
      'X-Api-Key': '[MASKED]',
      Accept: 'application/json'
    });
    expect(redactCdpUrl('https://api.example.com/path?token=secret#frag'))
      .toBe('https://api.example.com/path?token=%5BREDACTED%5D');
    expect(redactCdpText('x'.repeat(12), 5)).toBe('xxxxx...[truncated]');
  });
});
