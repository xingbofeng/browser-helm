import { z } from 'zod';

import { elementRefSchema } from './observation.schema';

export const tabDataStatusSchema = z.enum([
  'ready',
  'empty',
  'partial',
  'error',
  'unsupported'
]);

export const structuredPageWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  detail: z.unknown().optional()
});

export const structuredPageErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  detail: z.unknown().optional()
});

const tabDataBaseSchema = z.object({
  status: tabDataStatusSchema,
  summary: z.string(),
  count: z.number().int().nonnegative(),
  items: z.array(z.unknown()),
  updatedAt: z.string().datetime(),
  warnings: z.array(structuredPageWarningSchema.or(z.string())),
  error: structuredPageErrorSchema.optional(),
  emptyReason: z.string().min(1).optional()
});

export const tabDataSchema = tabDataBaseSchema.superRefine(validateTabData);

export const observationTabItemSchema = z.object({
  url: z.string().min(1),
  title: z.string(),
  currentDomain: z.string().min(1),
  origin: z.string().min(1),
  visibleTextSummary: z.string(),
  pageStateSummary: z.string()
});

export const observationTabDataSchema = tabDataBaseSchema.extend({
  items: z.array(observationTabItemSchema)
}).superRefine(validateTabData);

export const refTabDataSchema = tabDataBaseSchema.extend({
  items: z.array(elementRefSchema)
}).superRefine(validateTabData);

export const interactiveElementSchema = z.object({
  refId: z.string().min(1),
  role: z.string().optional(),
  name: z.string().optional(),
  tagName: z.string().min(1),
  visible: z.boolean(),
  disabled: z.boolean(),
  checked: z.boolean().optional(),
  selected: z.boolean().optional(),
  domOrder: z.number().int().nonnegative().optional(),
  warnings: z.array(structuredPageWarningSchema.or(z.string())).default([])
});

export const interactiveTabDataSchema = tabDataBaseSchema.extend({
  items: z.array(interactiveElementSchema)
}).superRefine(validateTabData);

export const disabledSubmitReasonSchema = z.object({
  kind: z.enum(['confirmed', 'inferred', 'unknown']),
  message: z.string().min(1),
  fieldRefId: z.string().min(1).optional()
});

export const formSubmitSummarySchema = z.object({
  refId: z.string().min(1).optional(),
  disabled: z.boolean(),
  reason: disabledSubmitReasonSchema.optional()
});

export const formFieldValidationSchema = z.object({
  valid: z.boolean(),
  message: z.string().optional(),
  ariaInvalid: z.boolean().optional()
});

export const formFieldSnapshotSchema = z.object({
  refId: z.string().min(1),
  label: z.string().optional(),
  name: z.string().optional(),
  type: z.string().min(1),
  required: z.boolean(),
  disabled: z.boolean(),
  sensitive: z.boolean(),
  valuePreview: z.string(),
  validation: formFieldValidationSchema,
  submit: formSubmitSummarySchema.optional(),
  warnings: z.array(structuredPageWarningSchema.or(z.string())).default([])
});

export const formFieldsTabDataSchema = tabDataBaseSchema.extend({
  items: z.array(formFieldSnapshotSchema)
}).superRefine(validateTabData);

export const interactiveFindPayloadSchema = z.object({
  status: tabDataStatusSchema,
  elements: z.array(interactiveElementSchema),
  count: z.number().int().nonnegative(),
  warnings: z.array(structuredPageWarningSchema.or(z.string()))
});

export const elementInspectPayloadSchema = z.object({
  element: interactiveElementSchema,
  warnings: z.array(structuredPageWarningSchema.or(z.string()))
});

export const elementReadStatePayloadSchema = z.object({
  refId: z.string().min(1),
  visible: z.boolean(),
  disabled: z.boolean(),
  checked: z.boolean().optional(),
  selected: z.boolean().optional(),
  warnings: z.array(structuredPageWarningSchema.or(z.string()))
});

export const formListItemSchema = z.object({
  formRefId: z.string().min(1).optional(),
  fieldCount: z.number().int().nonnegative(),
  submit: formSubmitSummarySchema.optional()
});

export const formListPayloadSchema = z.object({
  status: tabDataStatusSchema,
  forms: z.array(formListItemSchema),
  count: z.number().int().nonnegative(),
  warnings: z.array(structuredPageWarningSchema.or(z.string()))
});

export const formInspectPayloadSchema = z.object({
  formRefId: z.string().min(1).optional(),
  fields: z.array(formFieldSnapshotSchema),
  submit: formSubmitSummarySchema.optional(),
  warnings: z.array(structuredPageWarningSchema.or(z.string()))
});

export const formReadFieldsPayloadSchema = z.object({
  status: tabDataStatusSchema,
  fields: z.array(formFieldSnapshotSchema),
  count: z.number().int().nonnegative(),
  submit: formSubmitSummarySchema.optional(),
  warnings: z.array(structuredPageWarningSchema.or(z.string()))
});

export const formFindMissingRequiredPayloadSchema = z.object({
  fields: z.array(formFieldSnapshotSchema),
  count: z.number().int().nonnegative(),
  warnings: z.array(structuredPageWarningSchema.or(z.string()))
});

export const formFindValidationErrorsPayloadSchema =
  formFindMissingRequiredPayloadSchema;

export const formFindDisabledSubmitReasonPayloadSchema = z.object({
  submit: formSubmitSummarySchema.optional(),
  reason: disabledSubmitReasonSchema,
  warnings: z.array(structuredPageWarningSchema.or(z.string()))
});

export const structuredPageDataSchema = z.object({
  observation: observationTabDataSchema,
  refs: refTabDataSchema,
  interactive: interactiveTabDataSchema,
  forms: formFieldsTabDataSchema
});

export const structuredPageContextSummarySchema = z.object({
  url: z.string().min(1),
  title: z.string(),
  currentDomain: z.string().min(1),
  origin: z.string().min(1),
  summary: z.string(),
  counts: z.object({
    refs: z.number().int().nonnegative(),
    interactive: z.number().int().nonnegative(),
    forms: z.number().int().nonnegative()
  }),
  highlights: z.array(elementRefSchema),
  warnings: z.array(z.string())
});

export type TabDataStatus = z.infer<typeof tabDataStatusSchema>;
export type StructuredPageWarning = z.infer<typeof structuredPageWarningSchema>;
export type StructuredPageError = z.infer<typeof structuredPageErrorSchema>;
export type TabData = z.infer<typeof tabDataSchema>;
export type ObservationTabItem = z.infer<typeof observationTabItemSchema>;
export type InteractiveElement = z.infer<typeof interactiveElementSchema>;
export type DisabledSubmitReason = z.infer<typeof disabledSubmitReasonSchema>;
export type FormSubmitSummary = z.infer<typeof formSubmitSummarySchema>;
export type FormFieldSnapshot = z.infer<typeof formFieldSnapshotSchema>;
export type FormFieldTabItem = FormFieldSnapshot;
export type StructuredPageData = z.infer<typeof structuredPageDataSchema>;
export type StructuredPageContextSummary = z.infer<
  typeof structuredPageContextSummarySchema
>;

function validateTabData(
  value: z.infer<typeof tabDataBaseSchema>,
  ctx: z.RefinementCtx
): void {
  if (value.status === 'empty' && !value.emptyReason) {
    ctx.addIssue({
      code: 'custom',
      path: ['emptyReason'],
      message: 'empty tab data must include emptyReason'
    });
  }
}
