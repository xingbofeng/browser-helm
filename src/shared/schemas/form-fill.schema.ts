import { z } from 'zod';

import { toolRiskSchema } from './tool-result.schema';
import {
  disabledSubmitReasonSchema,
  structuredPageWarningSchema,
} from './structured-page-data.schema';

// ---------------------------------------------------------------------------
// Fill Plan
// ---------------------------------------------------------------------------

export const fillSourceSchema = z.enum([
  'user-task',
  'label-match',
  'name-match',
  'placeholder-match',
  'aria-label-match',
  'page-context',
  'default',
  'empty',
]);

export const fillConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const fillTargetSchema = z.object({
  fieldRefId: z.string().min(1),
  label: z.string().optional(),
  name: z.string().optional(),
  type: z.string().min(1),
  requestedValue: z.string().optional(),
  source: fillSourceSchema,
  confidence: fillConfidenceSchema,
  reason: z.string().min(1),
  maskedValuePreview: z.string().min(1),
  skipReason: z.string().min(1).optional(),
});

export const fillPlanSchema = z.object({
  formRefId: z.string().min(1).optional(),
  formSummary: z.string().min(1),
  userTask: z.string().min(1),
  fields: z.array(fillTargetSchema),
  skippedFields: z.array(
    z.object({
      fieldRefId: z.string().min(1),
      label: z.string().optional(),
      name: z.string().optional(),
      type: z.string().min(1),
      reason: z.string().min(1),
    })
  ),
});

// ---------------------------------------------------------------------------
// Fill Result
// ---------------------------------------------------------------------------

export const fillFieldStatusSchema = z.enum([
  'filled',
  'skipped',
  'failed',
  'cleared',
]);

export const fillFieldResultSchema = z.object({
  fieldRefId: z.string().min(1),
  label: z.string().optional(),
  name: z.string().optional(),
  type: z.string().min(1),
  status: fillFieldStatusSchema,
  requestedValue: z.string().optional(),
  actualValuePreview: z.string().optional(),
  maskedActualValue: z.string().optional(),
  skipReason: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  retried: z.boolean().optional(),
  changedPage: z.boolean().optional(),
});

export const fillManyResultSchema = z.object({
  ok: z.boolean(),
  formRefId: z.string().min(1).optional(),
  fields: z.array(fillFieldResultSchema),
  filledCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  changedPage: z.boolean(),
  requiresObserve: z.boolean(),
  retried: z.boolean().optional(),
  fallbackAvailable: z.boolean().optional(),
  summary: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export const verifyStatusSchema = z.enum(['pass', 'fail', 'warn']);

export const fieldVerifyResultSchema = z.object({
  fieldRefId: z.string().min(1),
  label: z.string().optional(),
  name: z.string().optional(),
  valid: z.boolean(),
  required: z.boolean(),
  filled: z.boolean(),
  validationMessage: z.string().optional(),
  ariaInvalid: z.boolean().optional(),
  actualValuePreview: z.string().optional(),
  maskedActualValue: z.string().optional(),
});

export const formVerifyResultSchema = z.object({
  status: verifyStatusSchema,
  formRefId: z.string().min(1).optional(),
  formAction: z.string().optional(),
  formMethod: z.string().optional(),
  allValid: z.boolean(),
  missingRequired: z.array(fieldVerifyResultSchema),
  invalidFields: z.array(fieldVerifyResultSchema),
  fieldResults: z.array(fieldVerifyResultSchema),
  disabledSubmitReason: disabledSubmitReasonSchema.optional(),
  visibleErrorText: z.array(z.string().min(1)),
  submitAvailable: z.boolean(),
  warnings: z.array(structuredPageWarningSchema.or(z.string())),
});

// ---------------------------------------------------------------------------
// Submit Approval
// ---------------------------------------------------------------------------

export const maskedFieldValueSchema = z.object({
  fieldRefId: z.string().min(1),
  label: z.string().min(1),
  name: z.string().optional(),
  type: z.string().min(1),
  valuePreview: z.string().min(1),
  isSensitive: z.boolean(),
  skipped: z.boolean().optional(),
});

export const submitApprovalPayloadSchema = z.object({
  runId: z.string().min(1),
  stepId: z.string().min(1),
  formRefId: z.string().min(1).optional(),
  formName: z.string().min(1),
  submitMethod: z.enum(['button-click', 'enter-submit']),
  submitTargetRefId: z.string().min(1).optional(),
  fields: z.array(maskedFieldValueSchema),
  fieldCount: z.number().int().nonnegative(),
  filledCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  verifyStatus: verifyStatusSchema,
  verifyFailed: z.boolean(),
  risk: toolRiskSchema,
  riskExplanation: z.string().min(1),
  highRisk: z.boolean(),
  warnings: z.array(z.string().min(1)),
});

// ---------------------------------------------------------------------------
// Submit Result
// ---------------------------------------------------------------------------

export const submitOutcomeSchema = z.enum(['success', 'failure', 'unknown']);

export const submitResultEvidenceSchema = z.object({
  urlChanged: z.boolean().optional(),
  urlAfter: z.string().optional(),
  successTextDetected: z.array(z.string().min(1)).optional(),
  successToastDetected: z.boolean().optional(),
  formReset: z.boolean().optional(),
  errorsCleared: z.boolean().optional(),
  visibleErrors: z.array(z.string().min(1)).optional(),
  pageUnchanged: z.boolean().optional(),
  currentFormErrors: z.array(z.string().min(1)).optional(),
});

export const submitResultSchema = z.object({
  outcome: submitOutcomeSchema,
  evidence: submitResultEvidenceSchema,
  summary: z.string().min(1),
  requiresObserve: z.boolean(),
  changedPage: z.boolean(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FillSource = z.infer<typeof fillSourceSchema>;
export type FillConfidence = z.infer<typeof fillConfidenceSchema>;
export type FillTarget = z.infer<typeof fillTargetSchema>;
export type FillPlan = z.infer<typeof fillPlanSchema>;
export type FillFieldStatus = z.infer<typeof fillFieldStatusSchema>;
export type FillFieldResult = z.infer<typeof fillFieldResultSchema>;
export type FillManyResult = z.infer<typeof fillManyResultSchema>;
export type VerifyStatus = z.infer<typeof verifyStatusSchema>;
export type FieldVerifyResult = z.infer<typeof fieldVerifyResultSchema>;
export type FormVerifyResult = z.infer<typeof formVerifyResultSchema>;
export type MaskedFieldValue = z.infer<typeof maskedFieldValueSchema>;
export type SubmitApprovalPayload = z.infer<typeof submitApprovalPayloadSchema>;
export type SubmitOutcome = z.infer<typeof submitOutcomeSchema>;
export type SubmitResultEvidence = z.infer<typeof submitResultEvidenceSchema>;
export type SubmitResult = z.infer<typeof submitResultSchema>;
