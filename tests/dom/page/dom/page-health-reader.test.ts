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
    expect(result.networkFailures).toHaveLength(1);
    expect(result.hasForm).toBe(true);
    expect(result.limitations).toContain('CDP deep inspection is not used in v1.0');
  });

  it('returns healthy empty state when no shallow signals exist', () => {
    Object.assign(window, {
      __browserHelmConsoleErrors: [],
      __browserHelmNetworkFailures: []
    });
    document.body.innerHTML = '<main>Hello</main>';

    const result = readPageHealthSummary(document);

    expect(result.consoleErrors).toEqual([]);
    expect(result.networkFailures).toEqual([]);
    expect(result.hasForm).toBe(false);
    expect(result.pageStateSummary).toContain('未发现明显页面异常');
  });
});
