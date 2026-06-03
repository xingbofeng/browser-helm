import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { RuntimeEvent } from '../../runtime/runtime-messages';
import type { TaskVerificationResult, VerificationInput } from './verifier-utils';
import {
  fail,
  isRecord,
  latestPayload,
  normalizeText,
  pass,
  stringField
} from './verifier-utils';

type FieldIntent = {
  fieldRefId: string;
  requestedValue?: string | undefined;
  sensitivity?: string | undefined;
};

export function verifyFormCompletion(input: VerificationInput): TaskVerificationResult {
  const intents = collectFieldIntents(input.trace);
  const latestVerify = latestPayload(input.trace, TRACE_EVENT_NAMES.FORM_VERIFY_RESULT);
  if (!latestVerify) {
    const fillEvidence = intents.filter((intent) =>
      stringField(latestFieldFillResult(input.trace, intent.fieldRefId), 'status') === 'filled'
    );
    if (intents.length > 0 && fillEvidence.length === intents.length) {
      return pass('form', 'Requested form fields have filled field-result evidence.', [
        { kind: 'field_fill_result', summary: `${fillEvidence.length} field(s) filled`, tool: TOOL_NAMES.FORM_FILL_MANY }
      ]);
    }
    return fail('form', 'unknown', 'Form fill has no semantic form verification result.', ['form_verify_result'], [], TOOL_NAMES.FORM_VERIFY);
  }
  const fieldResults = Array.isArray(latestVerify.payload.fieldResults)
    ? latestVerify.payload.fieldResults.filter(isRecord)
    : [];
  const status = stringField(latestVerify.payload, 'status');
  if (intents.length === 0) {
    if (status === 'pass' || latestVerify.payload.allValid === true) {
      return pass('form', 'Form verification passed.', [
        { kind: 'form_verify_result', summary: status ?? 'pass', tool: TOOL_NAMES.FORM_VERIFY }
      ]);
    }
    return fail('form', 'unknown', 'Form verifier has no requested field intents to compare.', ['field_intent']);
  }

  if (fieldResults.length === 0 && (status === 'pass' || latestVerify.payload.allValid === true)) {
    return pass('form', 'Form verification passed for requested fields.', [
      { kind: 'form_verify_result', summary: `${intents.length} requested field(s) verified`, tool: TOOL_NAMES.FORM_VERIFY }
    ]);
  }

  for (const intent of intents) {
    const fillResult = latestFieldFillResult(input.trace, intent.fieldRefId);
    if (fillResult && stringField(fillResult, 'status') === 'skipped') {
      if (intent.sensitivity === 'sensitive' || stringField(fillResult, 'skipReason')?.includes('sensitive')) {
        return fail(
          'form',
          'unknown',
          'Sensitive field was skipped and cannot count as completed without explicit approved support.',
          [`approved_sensitive_field_support:${intent.fieldRefId}`],
          [],
          TOOL_NAMES.FORM_FILL_FIELD
        );
      }
      return fail('form', 'unknown', 'Requested field was skipped.', [`field_filled:${intent.fieldRefId}`], [], TOOL_NAMES.FORM_FILL_FIELD);
    }
    if (fillResult && stringField(fillResult, 'status') !== 'filled') {
      return fail('form', 'unknown', 'Requested field has no filled result.', [`field_filled:${intent.fieldRefId}`], [], TOOL_NAMES.FORM_FILL_FIELD);
    }

    const verifiedField = fieldResults.find((field) => stringField(field, 'fieldRefId') === intent.fieldRefId);
    if (!verifiedField) {
      return fail('form', 'unknown', 'Requested field is missing from form verification.', [`field_verified:${intent.fieldRefId}`], [], TOOL_NAMES.FORM_VERIFY);
    }
    if (intent.sensitivity === 'sensitive') {
      return fail(
        'form',
        'unknown',
        'Sensitive field value is masked and cannot count as semantic completion evidence.',
        [`approved_sensitive_field_support:${intent.fieldRefId}`],
        [],
        TOOL_NAMES.FORM_VERIFY
      );
    }
    const actualValue = readActualValue(verifiedField);
    if (intent.requestedValue && actualValue && normalizeText(actualValue) !== normalizeText(intent.requestedValue)) {
      return fail(
        'form',
        'fail',
        'Verified field value does not match the requested value.',
        [`field_value_match:${intent.fieldRefId}`],
        [{ kind: 'field_verify_result', summary: intent.fieldRefId, tool: TOOL_NAMES.FORM_VERIFY }],
        TOOL_NAMES.FORM_VERIFY
      );
    }
    if (intent.requestedValue && !actualValue) {
      return fail(
        'form',
        'unknown',
        'Verified field has no readable actual value evidence.',
        [`field_value_evidence:${intent.fieldRefId}`],
        [],
        TOOL_NAMES.FORM_VERIFY
      );
    }
  }

  return pass('form', 'Requested form field values match verified field snapshots.', [
    { kind: 'form_verify_result', summary: `${intents.length} field(s) verified`, tool: TOOL_NAMES.FORM_VERIFY }
  ]);
}

export function collectFieldIntents(trace: RuntimeEvent[]): FieldIntent[] {
  const intents: FieldIntent[] = [];
  for (const event of trace) {
    if (event.type !== TRACE_EVENT_NAMES.TOOL_STARTED || !isRecord(event.payload) || !isRecord(event.payload.args)) {
      continue;
    }
    if (event.payload.tool === TOOL_NAMES.FORM_FILL_FIELD) {
      const intent = readFieldIntent(event.payload.args);
      if (intent) intents.push(intent);
    }
    if (event.payload.tool === TOOL_NAMES.FORM_FILL_MANY && Array.isArray(event.payload.args.fields)) {
      for (const field of event.payload.args.fields) {
        if (!isRecord(field)) continue;
        const intent = readFieldIntent(field);
        if (intent) intents.push(intent);
      }
    }
  }
  return dedupeIntents(intents);
}

function latestFieldFillResult(trace: RuntimeEvent[], fieldRefId: string): Record<string, unknown> | undefined {
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const event = trace[index];
    if (
      event?.type === TRACE_EVENT_NAMES.FIELD_FILL_RESULT &&
      isRecord(event.payload) &&
      stringField(event.payload, 'fieldRefId') === fieldRefId
    ) {
      return event.payload;
    }
  }
  return undefined;
}

function readFieldIntent(value: Record<string, unknown>): FieldIntent | undefined {
  const fieldRefId = stringField(value, 'fieldRefId');
  if (!fieldRefId) return undefined;
  return {
    fieldRefId,
    requestedValue: stringField(value, 'value') ?? stringField(value, 'requestedValue'),
    sensitivity: stringField(value, 'sensitivity')
  };
}

function readActualValue(value: Record<string, unknown>): string | undefined {
  return stringField(value, 'actualValue') ??
    stringField(value, 'actualValuePreview') ??
    stringField(value, 'valuePreview') ??
    stringField(value, 'maskedActualValue');
}

function dedupeIntents(intents: FieldIntent[]): FieldIntent[] {
  const byRef = new Map<string, FieldIntent>();
  intents.forEach((intent) => byRef.set(intent.fieldRefId, intent));
  return [...byRef.values()];
}
