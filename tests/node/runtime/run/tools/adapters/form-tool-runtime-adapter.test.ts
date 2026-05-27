import { describe, expect, it } from 'vitest';
import { FormToolRuntimeAdapter } from '../../../../../../src/background/runtime/run/tools/adapters/form-tool-runtime-adapter';
import { TOOL_NAMES } from '../../../../../../src/shared/constants/tool-names';
import { TRACE_EVENT_NAMES } from '../../../../../../src/shared/constants/event-names';

describe('FormToolRuntimeAdapter', () => {
  const adapter = new FormToolRuntimeAdapter();

  describe('beforeExecution', () => {
    it('emits FIELD_FILL_STARTED for FORM_FILL_FIELD', () => {
      const events = adapter.beforeExecution(
        { runId: 'r1', tool: TOOL_NAMES.FORM_FILL_FIELD, args: {} },
        { fieldRefId: 'ref_1', value: 'test' }
      );
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TRACE_EVENT_NAMES.FIELD_FILL_STARTED);
    });

    it('returns empty array for non-form tools', () => {
      const events = adapter.beforeExecution(
        { runId: 'r1', tool: 'bh_page_observe', args: {} }, {}
      );
      expect(events).toEqual([]);
    });

    it('handles malformed args without throwing', () => {
      expect(() => adapter.beforeExecution(
        { runId: 'r1', tool: TOOL_NAMES.FORM_FILL_FIELD, args: {} }, null
      )).not.toThrow();
    });
  });

  describe('afterExecution', () => {
    it('emits FILL_PLAN_CREATED for FORM_INFER_FILL_PLAN', () => {
      const events = adapter.afterExecution(
        { runId: 'r1', tool: TOOL_NAMES.FORM_INFER_FILL_PLAN, args: {} },
        { ok: true, code: 'OK', summary: 'Plan', changedPage: false, requiresObserve: false, data: { fields: [{}, {}] } }
      );
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TRACE_EVENT_NAMES.FILL_PLAN_CREATED);
    });

    it('emits FIELD_FILL_RESULT for FORM_FILL_FIELD', () => {
      const events = adapter.afterExecution(
        { runId: 'r1', tool: TOOL_NAMES.FORM_FILL_FIELD, args: {} },
        { ok: true, code: 'OK', summary: 'Filled', changedPage: false, requiresObserve: false, data: { fieldRefId: 'ref_1', status: 'filled', label: 'Email' } }
      );
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TRACE_EVENT_NAMES.FIELD_FILL_RESULT);
    });

    it('emits FORM_VERIFY_RESULT for FORM_VERIFY', () => {
      const events = adapter.afterExecution(
        { runId: 'r1', tool: TOOL_NAMES.FORM_VERIFY, args: {} },
        { ok: true, code: 'OK', summary: 'Verified', changedPage: false, requiresObserve: false, data: { status: 'pass', allValid: true } }
      );
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TRACE_EVENT_NAMES.FORM_VERIFY_RESULT);
    });

    it('handles malformed data without throwing', () => {
      expect(() => adapter.afterExecution(
        { runId: 'r1', tool: TOOL_NAMES.FORM_INFER_FILL_PLAN, args: {} },
        { ok: false, code: 'ERR', summary: 'fail', changedPage: false, requiresObserve: false }
      )).not.toThrow();
    });
  });

  describe('afterApprovalRequested', () => {
    it('emits SUBMIT_APPROVAL_REQUESTED for FORM_SUBMIT_WITH_APPROVAL', () => {
      const events = adapter.afterApprovalRequested(
        { runId: 'r1', tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL, args: {} },
        { ok: true, code: 'OK', summary: 'Approval needed', changedPage: false, requiresObserve: false, data: { formName: 'Login', verifyStatus: 'pass' }, approval: { risk: 'high', reason: 'form submit' } }
      );
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TRACE_EVENT_NAMES.SUBMIT_APPROVAL_REQUESTED);
    });

    it('returns empty for non-form-submit tools', () => {
      const events = adapter.afterApprovalRequested(
        { runId: 'r1', tool: 'other', args: {} },
        { ok: true, code: 'OK', summary: 'ok', changedPage: false, requiresObserve: false }
      );
      expect(events).toEqual([]);
    });
  });
});
