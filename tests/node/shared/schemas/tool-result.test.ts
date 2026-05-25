import { describe, expect, it } from 'vitest';

import { toolResultSchema } from '../../../../src/shared/schemas/tool-result.schema';

describe('toolResultSchema', () => {
  it('accepts success result with summary context visibility', () => {
    const result = toolResultSchema.parse({
      ok: true,
      code: 'OK',
      summary: 'Observation captured',
      nextHints: ['Continue to form analysis'],
      changedPage: false,
      requiresObserve: false,
      context: {
        visibility: 'summary',
        summary: 'Captured 12 interactive elements'
      }
    });

    expect(result.ok).toBe(true);
    expect(result.context?.visibility).toBe('summary');
  });

  it('accepts approval-required result', () => {
    const result = toolResultSchema.parse({
      ok: false,
      code: 'APPROVAL_REQUIRED',
      summary: 'Approval required before execution; action was not executed',
      requiresApproval: true,
      approval: {
        reason: 'High-risk submit action',
        risk: 'high',
        actionPreview: 'Click submit on checkout form'
      }
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.approval?.risk).toBe('high');
  });

  it('rejects invalid context visibility value', () => {
    expect(() =>
      toolResultSchema.parse({
        ok: true,
        code: 'OK',
        summary: 'done',
        context: {
          visibility: 'everything'
        }
      })
    ).toThrowError();
  });
});
