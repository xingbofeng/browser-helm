import { describe, expect, it } from 'vitest';
import {
  fillPlanSchema,
  fillFieldResultSchema,
  fillManyResultSchema,
  formVerifyResultSchema,
  submitApprovalPayloadSchema,
  submitResultSchema,
  maskedFieldValueSchema,
} from '../../../../src/shared/schemas/form-fill.schema';

describe('fillPlanSchema', () => {
  it('accepts a valid fill plan', () => {
    const plan = {
      formRefId: 'form-1',
      formSummary: 'login form',
      userTask: 'fill username',
      fields: [{ fieldRefId: 'r1', type: 'text', source: 'label-match', confidence: 'high', reason: 'matched', maskedValuePreview: 'tes***er', requestedValue: 'testuser' }],
      skippedFields: [{ fieldRefId: 'r2', type: 'password', reason: 'sensitive' }],
    };
    expect(fillPlanSchema.parse(plan)).toEqual(plan);
  });

  it('rejects empty userTask', () => {
    expect(() => fillPlanSchema.parse({ formSummary: 'x', userTask: '', fields: [], skippedFields: [] })).toThrow();
  });
});

describe('fillFieldResultSchema', () => {
  it('accepts filled result', () => {
    expect(fillFieldResultSchema.parse({ fieldRefId: 'r1', type: 'text', status: 'filled', actualValuePreview: 'hello' })).toBeDefined();
  });

  it('accepts skipped result', () => {
    expect(fillFieldResultSchema.parse({ fieldRefId: 'r1', type: 'password', status: 'skipped', skipReason: 'sensitive' })).toBeDefined();
  });

  it('rejects invalid status', () => {
    expect(() => fillFieldResultSchema.parse({ fieldRefId: 'r1', type: 'text', status: 'unknown' })).toThrow();
  });
});

describe('fillManyResultSchema', () => {
  it('accepts batch result', () => {
    expect(fillManyResultSchema.parse({ ok: true, fields: [], filledCount: 0, skippedCount: 0, failedCount: 0, changedPage: false, requiresObserve: false, summary: 'done' })).toBeDefined();
  });
});

describe('formVerifyResultSchema', () => {
  it('accepts pass result', () => {
    expect(formVerifyResultSchema.parse({ status: 'pass', allValid: true, missingRequired: [], invalidFields: [], fieldResults: [], visibleErrorText: [], submitAvailable: true, warnings: [] })).toBeDefined();
  });

  it('accepts fail result', () => {
    expect(formVerifyResultSchema.parse({ status: 'fail', allValid: false, missingRequired: [{ fieldRefId: 'r1', valid: false, required: true, filled: false }], invalidFields: [], fieldResults: [], visibleErrorText: ['missing'], submitAvailable: false, warnings: [] })).toBeDefined();
  });
});

describe('submitApprovalPayloadSchema', () => {
  it('accepts valid payload', () => {
    expect(submitApprovalPayloadSchema.parse({ runId: 'run', stepId: 'step', formName: 'test', submitMethod: 'button-click', fields: [], fieldCount: 0, filledCount: 0, skippedCount: 0, skippedFields: [], verifyStatus: 'pass', verifyFailed: false, risk: 'high', riskExplanation: 'test', highRisk: false, warnings: [] })).toBeDefined();
  });
});

describe('submitResultSchema', () => {
  it('accepts success', () => {
    expect(submitResultSchema.parse({ outcome: 'success', evidence: {}, summary: 'ok', requiresObserve: false, changedPage: true })).toBeDefined();
  });

  it('accepts unknown', () => {
    expect(submitResultSchema.parse({ outcome: 'unknown', evidence: {}, summary: 'unknown', requiresObserve: true, changedPage: false })).toBeDefined();
  });

  it('rejects bad outcome', () => {
    expect(() => submitResultSchema.parse({ outcome: 'error', evidence: {}, summary: 'x', requiresObserve: false, changedPage: false })).toThrow();
  });
});

describe('maskedFieldValueSchema', () => {
  it('accepts masked field', () => {
    expect(maskedFieldValueSchema.parse({ fieldRefId: 'r1', label: 'Pwd', type: 'password', valuePreview: '***', isSensitive: true, skipped: true })).toBeDefined();
  });

  it('rejects missing label', () => {
    expect(() => maskedFieldValueSchema.parse({ fieldRefId: 'r1', type: 'text', valuePreview: '***', isSensitive: false })).toThrow();
  });
});
