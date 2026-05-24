import { describe, expect, it } from 'vitest';

import {
  formatToolResultFlags,
  maskSensitiveValue,
  redactPreview
} from '../../../../src/ui/lib/format-tool';

describe('format-tool helpers', () => {
  it('formats tool result flags for inspector hints', () => {
    expect(
      formatToolResultFlags({
        tool: 'bh_iframe_click',
        ok: false,
        code: 'APPROVAL_REQUIRED',
        summary: 'Requires approval',
        requiresApproval: true,
        changedPage: false,
        requiresObserve: true
      })
    ).toEqual(['需要用户确认', '需要重新观察', '页面未修改']);
  });

  it('masks provider keys and sensitive args recursively', () => {
    expect(maskSensitiveValue('sk-1234567890')).toBe('sk-...7890');
    expect(
      redactPreview({
        apiKey: 'sk-live-secret',
        nested: {
          password: 'p@ssw0rd',
          value: 'safe'
        }
      })
    ).toEqual({
      apiKey: '[MASKED]',
      nested: {
        password: '[MASKED]',
        value: 'safe'
      }
    });
  });
});
