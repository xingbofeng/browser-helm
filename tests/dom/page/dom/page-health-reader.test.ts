// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { readPageHealthSummary } from '../../../../src/page/dom/page-health-reader';

describe('page-health-reader', () => {
  it('reads shallow console and network summaries without CDP', () => {
    Object.assign(window, {
      __browserHelmConsoleErrors: [
        {
          message: 'Uncaught TypeError',
          source: 'app.js'
        },
        {
          message: 'Uncaught TypeError',
          source: 'app.js'
        }
      ],
      __browserHelmConsoleMessages: [
        {
          level: 'warn',
          message: 'Slow response',
          source: 'console.warn'
        },
        {
          level: 'warn',
          message: 'Slow response',
          source: 'console.warn'
        }
      ],
      __browserHelmNetworkFailures: [
        {
          url: 'https://api.example.com/users',
          method: 'GET',
          errorText: 'Failed to fetch'
        }
      ]
    });
    document.body.innerHTML = '<form><input name="email" /></form>';

    const result = readPageHealthSummary(document);

    expect(result.consoleErrors).toEqual([
      {
        message: 'Uncaught TypeError',
        source: 'app.js',
        count: 2
      }
    ]);
    expect(result.consoleMessages).toEqual([
      {
        level: 'warn',
        message: 'Slow response',
        source: 'console.warn',
        count: 2
      }
    ]);
    expect(result.networkFailures).toHaveLength(1);
    expect(result.hasForm).toBe(true);
    expect(result.limitations).toContain('CDP deep inspection is not available in this mode');
  });

  it('returns healthy empty state when no shallow signals exist', () => {
    Object.assign(window, {
      __browserHelmConsoleErrors: [],
      __browserHelmConsoleMessages: [],
      __browserHelmNetworkFailures: []
    });
    document.body.innerHTML = '<main>Hello</main>';

    const result = readPageHealthSummary(document);

    expect(result.consoleErrors).toEqual([]);
    expect(result.consoleMessages).toEqual([]);
    expect(result.networkFailures).toEqual([]);
    expect(result.hasForm).toBe(false);
    expect(result.pageStateSummary).toContain('未发现明显页面异常');
  });

  it('redacts raw page-health URL paths, query strings, fragments, and provider secrets', () => {
    Object.assign(window, {
      __browserHelmConsoleErrors: [
        {
          message: 'failed https://api.example.com/private/path?token=secret#frag sk-1234567890abcdef',
          source: 'https://app.example.com/src/main.js?build=secret#L10'
        }
      ],
      __browserHelmConsoleMessages: [
        {
          level: 'warn',
          message: 'retry https://api.example.com/v1/users?api_key=secret',
          source: 'console.warn'
        }
      ],
      __browserHelmNetworkFailures: [
        {
          url: 'https://api.example.com/private/path?token=secret#frag',
          method: 'POST',
          errorText: 'failed with sk-1234567890abcdef'
        }
      ]
    });
    document.body.innerHTML = '<main>Hello</main>';

    const result = readPageHealthSummary(document);

    expect(result.consoleErrors).toEqual([
      {
        message: 'failed https://api.example.com/[REDACTED_PATH] [MASKED]',
        source: 'https://app.example.com/[REDACTED_PATH]',
        count: 1
      }
    ]);
    expect(result.consoleMessages).toEqual([
      {
        level: 'warn',
        message: 'retry https://api.example.com/[REDACTED_PATH]',
        source: 'console.warn',
        count: 1
      }
    ]);
    expect(result.networkFailures).toEqual([
      {
        url: 'https://api.example.com/[REDACTED_PATH]',
        method: 'POST',
        errorText: 'failed with [MASKED]'
      }
    ]);
  });
});
