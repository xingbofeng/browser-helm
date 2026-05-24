import { describe, expect, it } from 'vitest';

import {
  approvalRequiredResult,
  failedToolResult,
  successToolResult,
  userDeniedApprovalResult
} from '../../../../src/tools/core/tool-result-factory';

describe('tool-result-factory', () => {
  it('creates success result', () => {
    const result = successToolResult('OK', 'completed', {
      foo: 'bar'
    });

    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    expect(result.data).toEqual({
      foo: 'bar'
    });
  });

  it('creates failed result', () => {
    const result = failedToolResult(
      'TOOL_EXECUTION_FAILED',
      'execution failed',
      true
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('TOOL_EXECUTION_FAILED');
    expect(result.error?.message).toBe('execution failed');
  });

  it('creates approval required result', () => {
    const result = approvalRequiredResult({
      reason: 'high risk action',
      risk: 'high',
      actionPreview: 'submit checkout form'
    });

    expect(result.ok).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.code).toBe('APPROVAL_REQUIRED');
  });

  it('creates user denied approval result without marking page changed', () => {
    const result = userDeniedApprovalResult('User declined checkout submit');

    expect(result.ok).toBe(false);
    expect(result.code).toBe('USER_DENIED_APPROVAL');
    expect(result.summary).toBe('User declined checkout submit');
    expect(result.changedPage).toBe(false);
    expect(result.requiresObserve).toBe(false);
  });
});
