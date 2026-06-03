import { describe, expect, it } from 'vitest';

import { verifyTaskCompletionBeforeFinish } from '../../../../src/agent/verification/task-verifier';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('form semantic verifier', () => {
  it('denies finish when form fill only has trace-shape page change evidence', () => {
    const trace: RuntimeEvent[] = [{
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: TOOL_NAMES.FORM_FILL_MANY,
        ok: true,
        code: 'OK',
        summary: 'Filled fields',
        changedPage: true
      }
    }];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: false,
      status: 'unknown',
      verifier: 'form',
      missingEvidence: ['form_verify_result'],
      nextAction: 'continue'
    });
  });

  it('passes when requested field values match verified field snapshots', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_MANY,
          args: {
            fields: [{ fieldRefId: 'ref_email', value: 'alice@example.com' }]
          }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FIELD_FILL_RESULT,
        payload: {
          fieldRefId: 'ref_email',
          status: 'filled'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_VERIFY_RESULT,
        payload: {
          status: 'pass',
          allValid: true,
          fieldResults: [{
            fieldRefId: 'ref_email',
            actualValuePreview: 'alice@example.com'
          }]
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'form'
    });
  });

  it('denies finish when a verified field value differs from the requested value', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_FIELD,
          args: { fieldRefId: 'ref_email', value: 'alice@example.com' }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FIELD_FILL_RESULT,
        payload: {
          fieldRefId: 'ref_email',
          status: 'filled'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_VERIFY_RESULT,
        payload: {
          status: 'pass',
          allValid: true,
          fieldResults: [{
            fieldRefId: 'ref_email',
            actualValuePreview: 'bob@example.com'
          }]
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: false,
      status: 'fail',
      verifier: 'form',
      missingEvidence: ['field_value_match:ref_email']
    });
  });

  it('does not count skipped sensitive fields as completed fill evidence', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_FIELD,
          args: { fieldRefId: 'ref_password', value: 'secret', sensitivity: 'sensitive' }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FIELD_FILL_RESULT,
        payload: {
          fieldRefId: 'ref_password',
          status: 'skipped',
          skipReason: 'sensitive_field'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_VERIFY_RESULT,
        payload: {
          status: 'pass',
          allValid: true,
          fieldResults: [{
            fieldRefId: 'ref_password',
            maskedActualValue: '[MASKED]'
          }]
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace)).toMatchObject({
      ok: false,
      status: 'unknown',
      verifier: 'form',
      missingEvidence: ['approved_sensitive_field_support:ref_password']
    });
  });
});
